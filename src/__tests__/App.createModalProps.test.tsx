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

const taskCreateModalSpy = vi.hoisted(() => vi.fn());

vi.mock("@/features/task-form", async () => {
  const actual = await vi.importActual<typeof import("@/features/task-form")>(
    "@/features/task-form",
  );
  return {
    ...actual,
    TaskCreateModal: (props: { onClose: () => void }) => {
      taskCreateModalSpy(props);
      return (
        <button
          type="button"
          data-testid="mock-task-create-modal-close"
          onClick={props.onClose}
        >
          close
        </button>
      );
    },
  };
});

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

import { App } from "@/App";
import {
  createTask as createTaskInvoke,
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  openDirectoryDialog,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const createTaskMock = vi.mocked(createTaskInvoke);
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

const parentTask = Task.fromPayload({
  id: "parent",
  title: "親タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/parent.md",
});
const otherTask = Task.fromPayload({
  id: "other",
  title: "他タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/other.md",
});

const fixtureTasks = [parentTask, otherTask];

beforeEach(() => {
  taskCreateModalSpy.mockClear();
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  createTaskMock.mockReset();
  deleteTaskMock.mockReset();
  getColumnsMock.mockResolvedValue(
    Result.ok({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    }),
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const mountApp = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

const openProjectWithTasks = async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      tasks: fixtureTasks,
      columns: ["Todo", "Done"],
    }),
  );
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

const clickParentTaskCard = async () => {
  const cards = container?.querySelectorAll('[role="button"]') ?? [];
  const target = Array.from(cards).find((c) =>
    c.textContent?.includes("親タスク"),
  ) as HTMLElement | undefined;
  await act(async () => {
    target?.click();
  });
};

const clickSubIssueAddButton = async () => {
  const btn = container?.querySelector(
    '[data-testid="sub-issue-add-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    btn?.click();
  });
};

const clickColumnAddButton = async (columnName: string) => {
  const btn = container?.querySelector(
    `button[aria-label="${columnName}に追加"]`,
  ) as HTMLButtonElement | null;
  await act(async () => {
    btn?.click();
  });
};

const lastModalProps = (): Record<string, unknown> => {
  const calls = taskCreateModalSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Record<string, unknown>;
};

test("経路1: handleAddSubIssue → parentCandidates は親 1 件、parentReadOnly=true", async () => {
  mountApp();
  await openProjectWithTasks();
  await clickParentTaskCard();
  await clickSubIssueAddButton();

  const props = lastModalProps();
  const candidates = props.parentCandidates as Task[];
  expect(candidates).toHaveLength(1);
  expect(candidates[0]?.filePath).toBe("tasks/parent.md");
  expect(props.parentReadOnly).toBe(true);
  expect(props.initialParent).toBe("tasks/parent.md");
});

test("経路2: handleAddTask（通常作成）→ parentCandidates は tasks 全件、parentReadOnly=false", async () => {
  mountApp();
  await openProjectWithTasks();
  await clickColumnAddButton("Todo");

  const props = lastModalProps();
  const candidates = props.parentCandidates as Task[];
  expect(candidates.map((t) => t.filePath)).toEqual([
    "tasks/parent.md",
    "tasks/other.md",
  ]);
  expect(props.parentReadOnly).toBe(false);
  expect(props.initialParent).toBeUndefined();
});

test("経路3a: subIssue → close で modal が unmount される（close 経路の発火確認）", async () => {
  mountApp();
  await openProjectWithTasks();

  await clickParentTaskCard();
  await clickSubIssueAddButton();
  expect(lastModalProps().parentReadOnly).toBe(true);
  const callsBeforeClose = taskCreateModalSpy.mock.calls.length;

  // mock TaskCreateModal の閉じるボタンで handleCloseCreateModal を発火させる。
  // close 後は createModalStatus=null のため modal は再 render されず、spy も追加で呼ばれない。
  const closeBtn = container?.querySelector(
    '[data-testid="mock-task-create-modal-close"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    closeBtn?.click();
  });

  expect(
    container?.querySelector('[data-testid="mock-task-create-modal-close"]'),
  ).toBeNull();
  expect(taskCreateModalSpy.mock.calls.length).toBe(callsBeforeClose);
});

test("経路3b: subIssue → 直接 handleAddTask（通常作成）で parentReadOnly=false（stale leak 検出）", async () => {
  mountApp();
  await openProjectWithTasks();

  await clickParentTaskCard();
  await clickSubIssueAddButton();
  expect(lastModalProps().parentReadOnly).toBe(true);

  // close を挟まずに通常作成へ切り替える経路。handleAddTask 側の setSubIssueParentPath(undefined) 漏れを検出する。
  // close 側は経路3aで modal unmount までを確認し、reset 漏れはこの経路では検出対象にしない。
  await clickColumnAddButton("Todo");

  const props = lastModalProps();
  expect(props.parentReadOnly).toBe(false);
  const candidates = props.parentCandidates as Task[];
  expect(candidates.map((t) => t.filePath)).toEqual([
    "tasks/parent.md",
    "tasks/other.md",
  ]);
});

test("経路4: subIssue モード中に親タスクが tasks から消えると parentCandidates=[]", async () => {
  mountApp();
  await openProjectWithTasks();
  await clickParentTaskCard();
  await clickSubIssueAddButton();
  expect((lastModalProps().parentCandidates as Task[]).length).toBe(1);

  // DetailPanel の削除ボタン → ConfirmDialog → 確定 で親タスクを tasks から消す
  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));
  const deleteBtn = container?.querySelector(
    '[data-testid="detail-delete-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    deleteBtn?.click();
  });
  const confirmBtn = container?.querySelector(
    '[data-testid="confirm-confirm-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    confirmBtn?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  const props = lastModalProps();
  expect((props.parentCandidates as Task[]).length).toBe(0);
  expect(props.parentReadOnly).toBe(true);
  expect(props.initialParent).toBe("tasks/parent.md");
});
