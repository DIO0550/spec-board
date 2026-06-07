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

/** TaskCard を click して DetailScreen を開く。 */
const openDetailScreen = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
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

/** 現在表示中の label タグ文字列の集合を取得する。 */
const queryLabelTexts = (): string[] => {
  const editor = document.querySelector(
    '[data-testid="label-editor"]',
  ) as HTMLElement;
  return Array.from(editor.querySelectorAll("span")).map(
    (el) => el.firstChild?.textContent?.trim() ?? "",
  );
};

/** LabelEditor の「＋追加」を押して入力欄を開き、value を流して Enter で確定する。 */
const addLabelViaUI = async (value: string): Promise<void> => {
  const addButton = document.querySelector(
    '[data-testid="label-add-button"]',
  ) as HTMLButtonElement;
  await act(async () => {
    addButton.click();
  });
  const input = document.querySelector(
    '[data-testid="label-input"]',
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
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    // 楽観 dispatch（queue の microtask）を 1 度だけ流す
    await Promise.resolve();
  });
};

/** LabelEditor の × ボタンで指定 label を削除する。 */
const removeLabelViaUI = async (label: string): Promise<void> => {
  const removeButton = document.querySelector(
    `[aria-label="ラベル「${label}」を削除"]`,
  ) as HTMLButtonElement;
  await act(async () => {
    removeButton.click();
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
  openDetailScreen();

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
  openDetailScreen();

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
  openDetailScreen();

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
  openDetailScreen();

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
