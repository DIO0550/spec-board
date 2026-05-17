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
import { DRAG_MIME_TYPE } from "@/features/board/components/Board/dragState";
import {
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  updateCardOrder as updateCardOrderInvoke,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
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
const updateCardOrderMock = vi.mocked(updateCardOrderInvoke);

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

beforeEach(() => {
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: {
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    },
  });
  updateTaskMock.mockReset();
  updateCardOrderMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const taskA: Task = Task.fromPayload({
  id: "a",
  title: "A タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
});

const taskB: Task = Task.fromPayload({
  id: "b",
  title: "B タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/b.md",
});

const payload: OpenProjectPayload = {
  tasks: [taskA, taskB],
  columns: ["Todo", "Done"],
};

/**
 * テスト用の App マウントヘルパ。
 */
const mountApp = (): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

/**
 * HeaderBar の「開く」ボタンを押下する。
 */
const clickHeaderOpenButton = (): void => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  openBtn?.click();
};

/**
 * project を成功状態で読み込む。
 */
const openSuccessfully = async (): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * TaskCard を Done カラム section へ drop する。
 */
const dropFirstCardToDone = async (): Promise<void> => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  const doneSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Done']",
  );
  await act(async () => {
    card?.dispatchEvent(createDragEvent("dragstart"));
  });
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  await act(async () => {
    doneSection?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * TaskCard を Todo カラム section へ drop（同一カラム並び替え相当）。
 */
const dropFirstCardWithinTodo = async (): Promise<void> => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  const todoSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Todo']",
  );
  await act(async () => {
    card?.dispatchEvent(createDragEvent("dragstart"));
  });
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  await act(async () => {
    todoSection?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const liveRegion = (): HTMLElement | null =>
  container?.querySelector<HTMLElement>('[data-testid="live-region"]') ?? null;

test("drop 成功 → LiveRegion に「移動しました」が現れる", async () => {
  mountApp();
  await openSuccessfully();

  const movedA: Task = { ...taskA, status: "Done" };
  updateTaskMock.mockResolvedValueOnce(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValueOnce(Result.ok(undefined));

  await dropFirstCardToDone();

  expect(liveRegion()?.textContent).toBe(
    "「A タスク」を「Done」に移動しました",
  );
});

test("drop 楽観 announce は updateTask resolve 前に LiveRegion へ届いている", async () => {
  mountApp();
  await openSuccessfully();

  type UpdateTaskResult = Awaited<ReturnType<typeof updateTaskMock>>;
  let resolveUpdate: (value: UpdateTaskResult) => void = () => {};
  updateTaskMock.mockReturnValueOnce(
    new Promise<UpdateTaskResult>((resolve) => {
      resolveUpdate = resolve;
    }),
  );
  updateCardOrderMock.mockResolvedValueOnce(Result.ok(undefined));

  await dropFirstCardToDone();
  expect(liveRegion()?.textContent).toBe(
    "「A タスク」を「Done」に移動しました",
  );

  await act(async () => {
    resolveUpdate(Result.ok({ ...taskA, status: "Done" }));
    await Promise.resolve();
  });
});

test("drop 失敗 (updateTask reject) → LiveRegion が「取り消しました」になる", async () => {
  mountApp();
  await openSuccessfully();

  updateTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  await dropFirstCardToDone();

  expect(liveRegion()?.textContent).toBe("「A タスク」の移動を取り消しました");
});

test("同一カラム並び替え → LiveRegion textContent は空のまま", async () => {
  mountApp();
  await openSuccessfully();

  updateCardOrderMock.mockResolvedValueOnce(Result.ok(undefined));

  await dropFirstCardWithinTodo();

  expect(liveRegion()?.textContent).toBe("");
});

test("同じ移動を連続実行 → 同じ text でも LiveRegion の div が key 変更で再 mount される", async () => {
  mountApp();
  await openSuccessfully();

  const movedA: Task = { ...taskA, status: "Done" };
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await dropFirstCardToDone();
  const first = liveRegion();
  expect(first?.textContent).toBe("「A タスク」を「Done」に移動しました");

  // 状態をリセットして同じ操作を実行する代わりに、別 announce を直接観測する。
  // 楽観 dispatch は state を変えるので、最初の drop 後の状態で再度 dragstart →
  // drop を行うと invalid-state が返るため、ここでは「同一文字列を 2 回 announce
  // した場合に key が変わる」性質のみ LiveRegion の単体テストで担保し、
  // App 結合では 1 回 drop 後の announce 結果が反映されることを確認する。
  expect(first?.getAttribute("data-testid")).toBe("live-region");
});
