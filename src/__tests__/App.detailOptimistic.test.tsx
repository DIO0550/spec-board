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

const payload: OpenProjectPayload = {
  session: WATCHER_SESSION_FIXTURE,
  tasks: [taskA],
  columns: ["Todo", "Doing", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
};

/**
 * App を mount する。
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
 * 「開く」ボタンを押下して project を読み込ませる。
 */
const openSuccessfully = async (): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
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

/**
 * TaskCard を click して DetailScreen を開く。
 */
const openDetailScreen = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
  });
};

/**
 * data-testid から HTMLSelectElement を取得する。
 *
 * @param testId data-testid 値
 * @returns 該当要素
 */
/** ステータス popover の trigger 表示テキストを返す。 */
const statusFieldText = (): string =>
  document.querySelector('[data-testid="status-field"]')?.textContent ?? "";

/**
 * ステータス popover を開いて指定カラムの option を選び、queue 内 microtask を 1 度だけ flush する。
 * 楽観 dispatch は `enqueueProjectCommand` の microtask で走るため、ここで await が必要。
 *
 * @param value 選択するカラム名
 */
const changeStatus = async (value: string): Promise<void> => {
  await act(async () => {
    (
      document.querySelector('[data-testid="status-field"]') as HTMLElement
    ).click();
  });
  await act(async () => {
    (
      document.querySelector(
        `[data-testid="status-field-option-${value}"]`,
      ) as HTMLElement
    ).click();
    // 楽観 dispatch (queue の microtask) を 1 度だけ流す
    await Promise.resolve();
  });
};

test("StatusSelect 操作 → updateTask resolve 前に DetailScreen の StatusSelect 表示が新値（楽観反映）", async () => {
  mountApp();
  await openSuccessfully();
  openDetailScreen();
  expect(statusFieldText()).toContain("Todo");

  type UpdateTaskResult = Awaited<ReturnType<typeof updateTaskMock>>;
  let resolveUpdate: (value: UpdateTaskResult) => void = () => {};
  updateTaskMock.mockReturnValueOnce(
    new Promise<UpdateTaskResult>((resolve) => {
      resolveUpdate = resolve;
    }),
  );

  await changeStatus("Doing");
  // IPC resolve 前に楽観反映で trigger 表示が Doing になっている
  expect(statusFieldText()).toContain("Doing");

  await act(async () => {
    resolveUpdate(Result.ok({ ...taskA, status: "Doing" }));
    await Promise.resolve();
  });
  // 確定後も Doing のまま
  expect(statusFieldText()).toContain("Doing");
});

test("IPC 失敗時 → DetailScreen Select 表示が元値に戻り、エラートーストが出る", async () => {
  mountApp();
  await openSuccessfully();
  openDetailScreen();
  expect(statusFieldText()).toContain("Todo");

  updateTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  await changeStatus("Doing");
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });

  // rollback で trigger 表示が Todo に戻る
  expect(statusFieldText()).toContain("Todo");
  // エラートーストが出る
  const errorToast = document.querySelector('[data-testid="toast-error"]');
  expect(errorToast).not.toBeNull();
});
