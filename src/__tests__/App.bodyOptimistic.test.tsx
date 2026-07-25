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
    moveTask: vi.fn(),
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

const makeSeedTask = (body: string): Task =>
  Task.fromPayload({
    id: "a",
    title: "A タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body,
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

const mountApp = (): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

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

const openDetailScreen = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
  });
};

type UpdateTaskResult = Awaited<ReturnType<typeof updateTaskMock>>;

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

/** DetailScreen の MarkdownBody の表示テキストを取得する。 */
const queryBodyText = (): string => {
  const display = document.querySelector('[data-testid="markdown-body"]');
  return display?.textContent ?? "";
};

/** DetailScreen の MarkdownBody 内の checkbox を NodeList で取得する。 */
const queryBodyCheckboxes = (): NodeListOf<HTMLInputElement> =>
  document.querySelectorAll<HTMLInputElement>(
    '[data-testid="markdown-body"] input[type="checkbox"]',
  );

/**
 * DetailScreen の MarkdownBody 内の index 番目の checkbox をクリックする。
 * @param index - checkbox の 0 始まり index
 */
const clickBodyCheckbox = async (index: number): Promise<void> => {
  const checkboxes = queryBodyCheckboxes();
  await act(async () => {
    checkboxes[index]?.click();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * MarkdownBody の display 領域をクリックして textarea を開き、値を流して Cmd+Enter で確定する。
 * @param value - 確定後の body 値
 */
const editBodyViaUI = async (value: string): Promise<void> => {
  const display = document.querySelector<HTMLElement>(
    '[data-testid="markdown-body"]',
  );
  await act(async () => {
    display?.click();
  });
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '[data-testid="markdown-body-textarea"]',
  );
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    textarea?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
};

test("body 編集 → 楽観反映で IPC resolve 前に UI 上に新 body が即時描画される", async () => {
  const seedTask = makeSeedTask("元の本文");
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await editBodyViaUI("新しい本文");

  // IPC resolve 前に楽観反映で新 body が表示されている
  expect(queryBodyText()).toContain("新しい本文");

  const updatedTask: Task = { ...seedTask, body: "新しい本文" };
  await act(async () => {
    resolveUpdate(Result.ok(updatedTask));
    await Promise.resolve();
  });

  expect(updateTaskMock).toHaveBeenCalledWith({
    filePath: seedFilePath,
    body: "新しい本文",
  });

  await vi.waitFor(() => {
    const successToast = document.querySelector(
      '[data-testid="toast-success"]',
    );
    expect(successToast).not.toBeNull();
    expect(successToast?.textContent).toContain("タスクを更新しました");
  });
});

test("body 編集で IPC が失敗した場合、body が元値に rollback しエラー toast が表示される", async () => {
  const seedTask = makeSeedTask("元の本文");
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await editBodyViaUI("新しい本文");

  // 楽観反映を確認
  expect(queryBodyText()).toContain("新しい本文");

  await act(async () => {
    resolveUpdate(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
  });

  // rollback で body が "元の本文" に戻る
  await vi.waitFor(() => {
    expect(queryBodyText()).toContain("元の本文");
  });

  await vi.waitFor(() => {
    const errorToast = document.querySelector('[data-testid="toast-error"]');
    expect(errorToast).not.toBeNull();
    expect(errorToast?.textContent).toContain("タスクの更新に失敗しました");
  });
});

test("本文 checkbox の toggle で楽観反映され、IPC 成功で success toast が出る", async () => {
  const seedTask = makeSeedTask("- [ ] todo");
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await clickBodyCheckbox(0);

  // IPC resolve 前に楽観反映で checkbox が checked になっている
  expect(queryBodyCheckboxes()[0]?.checked).toBe(true);

  const updatedTask: Task = { ...seedTask, body: "- [x] todo" };
  await act(async () => {
    resolveUpdate(Result.ok(updatedTask));
    await Promise.resolve();
  });

  expect(updateTaskMock).toHaveBeenCalledWith({
    filePath: seedFilePath,
    body: "- [x] todo",
  });

  await vi.waitFor(() => {
    const successToast = document.querySelector(
      '[data-testid="toast-success"]',
    );
    expect(successToast).not.toBeNull();
    expect(successToast?.textContent).toContain("タスクを更新しました");
  });
});

test("本文 checkbox の toggle が IPC 失敗で未チェックに rollback しエラー toast が出る", async () => {
  const seedTask = makeSeedTask("- [ ] todo");
  const { pending, resolveUpdate } = makeDeferredUpdate();
  updateTaskMock.mockReturnValueOnce(pending);

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await clickBodyCheckbox(0);
  expect(queryBodyCheckboxes()[0]?.checked).toBe(true);

  await act(async () => {
    resolveUpdate(Result.err(new TauriError("IO_ERROR", "io fail")));
    await Promise.resolve();
  });

  // rollback で checkbox が未チェックに戻る
  await vi.waitFor(() => {
    expect(queryBodyCheckboxes()[0]?.checked).toBe(false);
  });

  await vi.waitFor(() => {
    const errorToast = document.querySelector('[data-testid="toast-error"]');
    expect(errorToast).not.toBeNull();
    expect(errorToast?.textContent).toContain("タスクの更新に失敗しました");
  });
});

test("本文 checkbox を連続 toggle すると 2 回目も累積 body から生成される（stale body にならない）", async () => {
  const seedTask = makeSeedTask("- [ ] a\n- [ ] b");
  // IPC は渡された body をそのまま保存する Rust update_task の挙動を再現する。
  updateTaskMock.mockImplementation((params) =>
    Promise.resolve(
      Result.ok({ ...seedTask, body: params.body ?? seedTask.body }),
    ),
  );

  mountApp();
  await openSuccessfully(seedTask);
  openDetailScreen();

  await clickBodyCheckbox(0);
  await clickBodyCheckbox(1);

  expect(updateTaskMock).toHaveBeenNthCalledWith(1, {
    filePath: seedFilePath,
    body: "- [x] a\n- [ ] b",
  });
  expect(updateTaskMock).toHaveBeenNthCalledWith(2, {
    filePath: seedFilePath,
    body: "- [x] a\n- [x] b",
  });
});
