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
    updateCardOrder: vi.fn(),
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
  tasks: [seedTask],
  columns: ["Todo", "Doing", "Done"],
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

const openDetailPanel = (): void => {
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

const queryDetailPanel = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('aside[aria-label="タスク詳細"]');

const queryDetailFilePath = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="detail-file-path"]');

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

test("削除確定 → pending 中: カード消失 + DetailPanel 維持 → invoke 成功で panel close + toast + announce", async () => {
  const seedTask = makeSeedTask();
  const { pending, resolveDelete } = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailPanel();

  // DetailPanel が開いて seed task の filePath が表示されている
  expect(queryDetailFilePath()?.textContent).toBe(seedFilePath);

  await clickDeleteButton();
  expect(queryConfirmDialog()).not.toBeNull();

  await clickConfirmButton();

  // invoke pending 中: Board からカードが消えている (楽観反映)
  expect(queryTaskCard()).toBeNull();
  // DetailPanel は pendingDeleteTask snapshot 経由で維持される
  expect(queryDetailPanel()).not.toBeNull();
  expect(queryDetailFilePath()?.textContent).toBe(seedFilePath);

  await act(async () => {
    resolveDelete(Result.ok(undefined));
    await Promise.resolve();
    await Promise.resolve();
  });

  // 成功: DetailPanel が閉じる
  await vi.waitFor(() => {
    expect(queryDetailPanel()).toBeNull();
  });

  // toast success + live-region に削除アナウンス
  const successToast = document.querySelector('[data-testid="toast-success"]');
  expect(successToast).not.toBeNull();
  expect(successToast?.textContent).toContain("タスクを削除しました");
  // LiveRegion は同一文言の再読み上げ用に末尾へゼロ幅スペースを付与する場合があるため
  // 完全一致ではなく contains で判定する。
  expect(queryLiveRegionText()).toContain(`「${seedTitle}」を削除しました`);
});

test("削除確定 → invoke 失敗で rollback + DetailPanel 継続表示 + announce 取り消し", async () => {
  const seedTask = makeSeedTask();
  const { pending, resolveDelete } = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailPanel();

  await clickDeleteButton();
  await clickConfirmButton();

  // 楽観反映後にカードが消えている
  expect(queryTaskCard()).toBeNull();

  await act(async () => {
    resolveDelete(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
    await Promise.resolve();
  });

  // rollback で Board にカード復活
  await vi.waitFor(() => {
    expect(queryTaskCard()).not.toBeNull();
  });
  // DetailPanel は引き続き表示
  expect(queryDetailPanel()).not.toBeNull();
  expect(queryDetailFilePath()?.textContent).toBe(seedFilePath);

  // toast error + live-region に取り消しアナウンス
  const errorToast = document.querySelector('[data-testid="toast-error"]');
  expect(errorToast).not.toBeNull();
  expect(errorToast?.textContent).toContain("タスクの削除に失敗しました");
  expect(queryLiveRegionText()).toContain(
    `「${seedTitle}」の削除を取り消しました`,
  );

  // useDeleteFlow は error 状態で ConfirmDialog が維持される
  expect(queryConfirmDialog()).not.toBeNull();
});

test("失敗後の retry: ConfirmDialog '削除' 再押下で 2 回目 invoke が成功", async () => {
  const seedTask = makeSeedTask();
  const deferred1 = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(deferred1.pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailPanel();

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

  // 成功: DetailPanel が閉じる
  await vi.waitFor(() => {
    expect(queryDetailPanel()).toBeNull();
  });
  expect(deleteTaskMock).toHaveBeenCalledTimes(2);
});

test("削除 pending 中に open-start (project switch) が走ると pendingDeleteTask が clear され DetailPanel が消える", async () => {
  const seedTask = makeSeedTask();
  const { pending, resolveDelete } = makeDeferredDelete();
  deleteTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask, "/p");
  openDetailPanel();

  await clickDeleteButton();
  await clickConfirmButton();

  // 楽観反映: Board からカード消失 + DetailPanel は snapshot で残る
  expect(queryTaskCard()).toBeNull();
  expect(queryDetailPanel()).not.toBeNull();

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

  // render-phase reset で pendingDeleteTask が null になり DetailPanel が unmount される
  await vi.waitFor(() => {
    expect(queryDetailPanel()).toBeNull();
  });

  // teardown: delete invoke と open invoke を resolve させて promise を解消する
  await act(async () => {
    resolveDelete(Result.ok(undefined));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    resolveOpen(Result.ok({ tasks: [], columns: ["Todo"] }));
    await Promise.resolve();
    await Promise.resolve();
  });
});
