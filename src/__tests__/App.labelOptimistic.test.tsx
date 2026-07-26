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
  getColumns as getColumnsInvoke,
  getLabels as getLabelsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openDirectoryDialog: vi.fn(),
    openProject: vi.fn(),
    getColumns: vi.fn(),
    getLabels: vi.fn(),
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
const getLabelsMock = vi.mocked(getLabelsInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);

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

/** seed task を生成する。labels は test ごとに override で差し替える。 */
const makeSeedTask = (labels: readonly string[]): Task =>
  Task.fromPayload({
    id: "a",
    title: "A タスク",
    status: "Todo",
    labels: [...labels],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: seedFilePath,
  });

/** open_project mock の返り値を seed task で構築する。 */
const makePayload = (seedTask: Task): OpenProjectPayload => ({
  tasks: [seedTask],
  columns: ["Todo", "Doing", "Done"],
  projections: new Map(),
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
  getLabelsMock.mockReset();
  // 編集画面ラベル popover の候補。既存ラベルはここに含め、トグル解除できるようにする。
  getLabelsMock.mockResolvedValue(
    Result.ok({
      labels: [{ name: "existing" }, { name: "bug" }, { name: "frontend" }],
      usageCounts: {},
    }),
  );
  updateTaskMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

/** App を mount する。 */
const mountApp = (): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

/** 「開く」ボタンを押下して project を読み込ませる。 */
const openSuccessfully = async (seedTask: Task): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(makePayload(seedTask)));
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  await act(async () => {
    openBtn?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/** TaskCard を click して DetailScreen を開き、ラベル候補取得（useLabelList）をフラッシュする。 */
const openDetailScreen = async (): Promise<void> => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  await act(async () => {
    card?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

type UpdateTaskResult = Awaited<ReturnType<typeof updateTaskMock>>;

/** deferred Promise を作る。楽観反映を IPC resolve 前に観測するために使う。 */
const makeDeferredUpdate = (): {
  pending: Promise<UpdateTaskResult>;
  resolveUpdate: (value: UpdateTaskResult) => void;
} => {
  let resolveUpdate: (value: UpdateTaskResult) => void = () => {};
  const pending = new Promise<UpdateTaskResult>((resolve) => {
    resolveUpdate = resolve;
  });
  return { pending, resolveUpdate };
};

/**
 * 現在の選択済みラベル文字列の集合を取得する（trigger バッジのみ・popover option は除外）。
 * popover はトリガーボタンの兄弟要素のため、trigger 配下のバッジだけが対象になる。
 */
const queryLabelTexts = (): string[] => {
  const trigger = document.querySelector('[data-testid="detail-labels"]');
  return Array.from(trigger?.querySelectorAll(".rounded-full") ?? []).map(
    (el) => el.textContent?.trim() ?? "",
  );
};

/** ラベル popover を開く（各テストで 1 回だけ呼ぶ前提）。 */
const openLabelsPopover = async (): Promise<void> => {
  const trigger = document.querySelector(
    '[data-testid="detail-labels"]',
  ) as HTMLButtonElement;
  await act(async () => {
    trigger.click();
  });
};

/** ラベル popover の検索欄に value を入れて「作成」ボタンで新規追加する。 */
const addLabelViaUI = async (value: string): Promise<void> => {
  await openLabelsPopover();
  const input = document.querySelector(
    '[data-testid="detail-labels-search"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (
      document.querySelector(
        '[data-testid="detail-labels-create"]',
      ) as HTMLButtonElement
    ).click();
    // 楽観 dispatch（queue の microtask）を 1 度だけ流す
    await Promise.resolve();
  });
};

/** ラベル popover で指定 label の候補をトグルして削除する。 */
const removeLabelViaUI = async (label: string): Promise<void> => {
  await openLabelsPopover();
  await act(async () => {
    (
      document.querySelector(
        `[data-testid="detail-labels-option-${label}"]`,
      ) as HTMLButtonElement
    ).click();
    // 楽観 dispatch（queue の microtask）を 1 度だけ流す
    await Promise.resolve();
  });
};

test("ラベル追加 → 楽観反映 → IPC resolve で確定し、成功 toast と updateTask 呼び出しが行われる", async () => {
  const seedTask = makeSeedTask(["existing"]);
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  await openDetailScreen();

  await addLabelViaUI("new-label");

  // IPC resolve 前に楽観反映で "new-label" が表示されている
  expect(queryLabelTexts()).toEqual(["existing", "new-label"]);

  const updatedTask: Task = {
    ...seedTask,
    labels: ["existing", "new-label"],
  };
  await act(async () => {
    resolveUpdate(Result.ok(updatedTask));
    await Promise.resolve();
  });

  // updateTask が想定の引数で呼ばれている
  expect(updateTaskMock).toHaveBeenCalledWith({
    filePath: seedFilePath,
    labels: ["existing", "new-label"],
  });

  // 確定後も labels が新値のまま
  await vi.waitFor(() => {
    expect(queryLabelTexts()).toEqual(["existing", "new-label"]);
  });

  // 成功 toast が表示されている
  await vi.waitFor(() => {
    const successToast = document.querySelector(
      '[data-testid="toast-success"]',
    );
    expect(successToast).not.toBeNull();
    expect(successToast?.textContent).toContain("タスクを更新しました");
  });
});

test("ラベル追加で invoke が失敗した場合、labels が元に戻りエラー toast が表示される", async () => {
  const seedTask = makeSeedTask(["existing"]);
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  await openDetailScreen();

  await addLabelViaUI("new-label");

  // 楽観反映を確認
  expect(queryLabelTexts()).toEqual(["existing", "new-label"]);

  await act(async () => {
    resolveUpdate(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
  });

  // rollback で "new-label" が消えて "existing" のみに戻る
  await vi.waitFor(() => {
    expect(queryLabelTexts()).toEqual(["existing"]);
  });

  // エラー toast が表示される
  await vi.waitFor(() => {
    const errorToast = document.querySelector('[data-testid="toast-error"]');
    expect(errorToast).not.toBeNull();
    expect(errorToast?.textContent).toContain("タスクの更新に失敗しました");
  });
});

test("× 削除 → 楽観反映 → IPC resolve で確定し、成功 toast と updateTask 呼び出しが行われる", async () => {
  const seedTask = makeSeedTask(["bug", "frontend"]);
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  await openDetailScreen();

  await removeLabelViaUI("bug");

  // IPC resolve 前に "bug" が消えている
  expect(queryLabelTexts()).toEqual(["frontend"]);

  const updatedTask: Task = {
    ...seedTask,
    labels: ["frontend"],
  };
  await act(async () => {
    resolveUpdate(Result.ok(updatedTask));
    await Promise.resolve();
  });

  // updateTask が想定の引数で呼ばれている
  expect(updateTaskMock).toHaveBeenCalledWith({
    filePath: seedFilePath,
    labels: ["frontend"],
  });

  // 成功 toast が表示されている
  await vi.waitFor(() => {
    const successToast = document.querySelector(
      '[data-testid="toast-success"]',
    );
    expect(successToast).not.toBeNull();
  });
});

test("× 削除で invoke が失敗した場合、labels が元に戻りエラー toast が表示される", async () => {
  const seedTask = makeSeedTask(["bug", "frontend"]);
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  await openDetailScreen();

  await removeLabelViaUI("bug");

  // 楽観反映で "bug" が消えている
  expect(queryLabelTexts()).toEqual(["frontend"]);

  await act(async () => {
    resolveUpdate(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
  });

  // rollback で "bug" が復活する
  await vi.waitFor(() => {
    expect(queryLabelTexts()).toEqual(["bug", "frontend"]);
  });

  // エラー toast が表示される
  await vi.waitFor(() => {
    const errorToast = document.querySelector('[data-testid="toast-error"]');
    expect(errorToast).not.toBeNull();
  });
});
