import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { App } from "@/App";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
} from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openDirectoryDialog: vi.fn(),
    openProject: vi.fn(),
    getColumns: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    updateColumns: vi.fn(),
    moveTask: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const deleteTaskMock = vi.mocked(deleteTaskInvoke);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const seedFilePath = "tasks/a.md";
const seedTitle = "A タスク";

const makeSeedTask = (): Task =>
  Task.fromPayload({
    id: "a",
    title: seedTitle,
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: seedFilePath,
  });

const makePayload = (seedTask: Task): OpenProjectPayload => ({
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks: [seedTask],
  columns: ["Todo", "Doing", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
});

beforeEach(() => {
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: {
      columns: [
        { name: "Todo", order: 0 },
        { name: "Doing", order: 1 },
        { name: "Done", order: 2 },
      ],
      doneColumn: "Done",
    },
  });
  deleteTaskMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const mountApp = (): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

const clickHeaderOpenButton = async (): Promise<void> => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  await act(async () => {
    openBtn?.click();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const openSuccessfully = async (seedTask: Task, path = "/p"): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok(path));
  openProjectMock.mockResolvedValueOnce(Result.ok(makePayload(seedTask)));
  await clickHeaderOpenButton();
};

const openDetailScreen = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
  });
};

const clickDeleteButton = async (): Promise<void> => {
  const btn = document.querySelector(
    '[data-testid="detail-delete-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    btn?.click();
  });
};

const clickConfirmButton = async (): Promise<void> => {
  const btn = document.querySelector(
    '[data-testid="confirm-confirm-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    btn?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const queryTaskCard = (): HTMLElement | null =>
  container?.querySelector<HTMLElement>("[data-testid='task-card']") ?? null;

const queryDetailScreen = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('section[aria-label="タスク詳細"]');

const queryDetailTitleValue = (): string =>
  document.querySelector<HTMLInputElement>(
    '[data-testid="editable-text-display"]',
  )?.value ?? "";

const queryConfirmDialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="confirm-dialog"]');

const queryLiveRegionText = (): string =>
  document.querySelector('[data-testid="live-region"]')?.textContent ?? "";

type DeleteTaskResult = Awaited<ReturnType<typeof deleteTaskMock>>;

const makeDeferredDelete = (): {
  pending: Promise<DeleteTaskResult>;
  resolveDelete: (value: DeleteTaskResult) => void;
} => {
  let resolveDelete: (value: DeleteTaskResult) => void = () => {};
  const pending = new Promise<DeleteTaskResult>((resolve) => {
    resolveDelete = resolve;
  });
  return { pending, resolveDelete };
};

test("削除確定 → pending 中: カード消失 + DetailScreen 維持 → invoke 成功で panel close + toast + announce", async () => {
  const seedTask = makeSeedTask();
  const { pending, resolveDelete } = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  // DetailScreen が開いて seed task の filePath が表示されている
  expect(queryDetailTitleValue()).toBe(seedTitle);

  await clickDeleteButton();
  expect(queryConfirmDialog()).not.toBeNull();

  await clickConfirmButton();

  // invoke pending 中: Board からカードが消えている (楽観反映)
  expect(queryTaskCard()).toBeNull();
  // DetailScreen は pendingDeleteTask snapshot 経由で維持される
  expect(queryDetailScreen()).not.toBeNull();
  expect(queryDetailTitleValue()).toBe(seedTitle);

  await act(async () => {
    resolveDelete(Result.ok(undefined));
    await Promise.resolve();
    await Promise.resolve();
  });

  // 成功: DetailScreen が閉じる
  await vi.waitFor(() => {
    expect(queryDetailScreen()).toBeNull();
  });

  // toast success + live-region に削除アナウンス
  const successToast = document.querySelector('[data-testid="toast-success"]');
  expect(successToast).not.toBeNull();
  expect(successToast?.textContent).toContain("タスクを削除しました");
  // LiveRegion は同一文言の再読み上げ用に末尾へゼロ幅スペースを付与する場合があるため
  // 完全一致ではなく contains で判定する。
  expect(queryLiveRegionText()).toContain(`「${seedTitle}」を削除しました`);
});

test("削除確定 → invoke 失敗で rollback + DetailScreen 継続表示 + announce 取り消し", async () => {
  const seedTask = makeSeedTask();
  const { pending, resolveDelete } = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await clickDeleteButton();
  await clickConfirmButton();

  // detail 表示中はボードが描画されないため、楽観反映でカードは DOM に存在しない
  expect(queryTaskCard()).toBeNull();

  await act(async () => {
    resolveDelete(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
    await Promise.resolve();
  });

  // 失敗後も DetailScreen は閉じず、表示対象タスクが維持される（detail に留まる）
  await vi.waitFor(() => {
    expect(queryDetailScreen()).not.toBeNull();
  });
  expect(queryDetailTitleValue()).toBe(seedTitle);

  // toast error + live-region に取り消しアナウンス
  const errorToast = document.querySelector('[data-testid="toast-error"]');
  expect(errorToast).not.toBeNull();
  expect(errorToast?.textContent).toContain("タスクの削除に失敗しました");
  expect(queryLiveRegionText()).toContain(
    `「${seedTitle}」の削除を取り消しました`,
  );

  // useDeleteFlow は error 状態で ConfirmDialog が維持される
  expect(queryConfirmDialog()).not.toBeNull();

  // rollback の確認: 「← 戻る」で board へ戻すと復活したカードが見える
  await act(async () => {
    (
      document.querySelector(
        '[data-testid="detail-back-button"]',
      ) as HTMLElement
    ).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(queryTaskCard()).not.toBeNull();
});

test("失敗後の retry: ConfirmDialog '削除' 再押下で 2 回目 invoke が成功", async () => {
  const seedTask = makeSeedTask();
  const deferred1 = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(deferred1.pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await clickDeleteButton();
  await clickConfirmButton();

  await act(async () => {
    deferred1.resolveDelete(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
    await Promise.resolve();
  });

  // ConfirmDialog が維持されている
  await vi.waitFor(() => {
    expect(queryConfirmDialog()).not.toBeNull();
  });

  // 2 回目 invoke は成功させる
  const deferred2 = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(deferred2.pending);

  await clickConfirmButton();
  await act(async () => {
    deferred2.resolveDelete(Result.ok(undefined));
    await Promise.resolve();
    await Promise.resolve();
  });

  // 成功: DetailScreen が閉じる
  await vi.waitFor(() => {
    expect(queryDetailScreen()).toBeNull();
  });
  expect(deleteTaskMock).toHaveBeenCalledTimes(2);
});

test("削除 pending 中に open-start (project switch) が走ると pendingDeleteTask が clear され DetailScreen が消える", async () => {
  const seedTask = makeSeedTask();
  const { pending, resolveDelete } = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask, "/p");
  openDetailScreen();

  await clickDeleteButton();
  await clickConfirmButton();

  // 楽観反映: Board からカード消失 + DetailScreen は snapshot で残る
  expect(queryTaskCard()).toBeNull();
  expect(queryDetailScreen()).not.toBeNull();

  // 別 path で openProject を発火する。
  // projectCommandQueue 直列化で openProjectInvoke 自体は delete 完了を待つが
  // open-start dispatch は queue 外で即時実行され state は loading.previousLoaded へ遷移する。
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  // openProject invoke は queue で後回しになるので resolve しないまま deferred で残す
  let resolveOpen!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((res) => {
      resolveOpen = res;
    }),
  );
  await clickHeaderOpenButton();

  // AppShell の render-phase reset (他 state) と AppViewProvider key remount (view)
  // の組み合わせで pendingDeleteTask が null になり DetailScreen が unmount される
  await vi.waitFor(() => {
    expect(queryDetailScreen()).toBeNull();
  });

  // teardown: delete invoke と open invoke を resolve させて promise を解消する
  await act(async () => {
    resolveDelete(Result.ok(undefined));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    resolveOpen(
      Result.ok({
        loadWarnings: [],
        session: WATCHER_SESSION_FIXTURE,
        tasks: [],
        columns: ["Todo"],
        projections: new Map(),
        milestoneProjections: new Map(),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
});
