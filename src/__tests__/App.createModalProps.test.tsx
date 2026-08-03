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
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";

const taskCreateScreenSpy = vi.hoisted(() => vi.fn());

vi.mock("@/features/task-form", async () => {
  const actual = await vi.importActual<typeof import("@/features/task-form")>(
    "@/features/task-form",
  );
  return {
    ...actual,
    TaskCreateScreen: (props: { onClose: () => void }) => {
      taskCreateScreenSpy(props);
      return (
        <button
          type="button"
          data-testid="mock-task-create-screen-close"
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
    moveTask: vi.fn(),
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
  taskCreateScreenSpy.mockClear();
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
      session: WATCHER_SESSION_FIXTURE,
      tasks: fixtureTasks,
      columns: ["Todo", "Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      loadWarnings: [],
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
  const calls = taskCreateScreenSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Record<string, unknown>;
};

const clickDetailBackButton = async () => {
  const btn = container?.querySelector(
    '[data-testid="detail-back-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    btn?.click();
  });
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
  // 同期バッジ用の watchedFileCount は読み込み済みタスク総数、projectName は path 末尾。
  expect(props.watchedFileCount).toBe(fixtureTasks.length);
  expect(props.projectName).toBe("p");
});

test("create ビューでは共通の HeaderBar / AppSidebar が描画されない（全画面 standalone）", async () => {
  mountApp();
  await openProjectWithTasks();
  // board では HeaderBar（header 要素）が存在する。
  expect(container?.querySelector("header")).not.toBeNull();
  await clickColumnAddButton("Todo");
  // create では全画面 chrome へ切り替わり、共通 HeaderBar / 「開く」ボタンは消える。
  expect(container?.querySelector("header")).toBeNull();
  const buttons = Array.from(container?.querySelectorAll("button") ?? []);
  expect(buttons.some((b) => b.textContent === "開く")).toBe(false);
  // ToastContainer / LiveRegion 等の縦断 UI は温存しつつ作成画面（mock）は描画される。
  expect(
    container?.querySelector('[data-testid="mock-task-create-screen-close"]'),
  ).not.toBeNull();
});

test("経路3a: subIssue → close で作成画面が unmount され元の detail へ戻る", async () => {
  mountApp();
  await openProjectWithTasks();

  await clickParentTaskCard();
  await clickSubIssueAddButton();
  expect(lastModalProps().parentReadOnly).toBe(true);
  const callsBeforeClose = taskCreateScreenSpy.mock.calls.length;

  // mock TaskCreateScreen の閉じるボタンで handleCloseCreateModal を発火させる。
  // close 後は createModalStatus=null のため作成画面は再 render されず、spy も追加で呼ばれない。
  // 戻り先は returnView="detail" のため、元の detail（親タスク）へ復帰する。
  const closeBtn = container?.querySelector(
    '[data-testid="mock-task-create-screen-close"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    closeBtn?.click();
  });

  expect(
    container?.querySelector('[data-testid="mock-task-create-screen-close"]'),
  ).toBeNull();
  expect(taskCreateScreenSpy.mock.calls.length).toBe(callsBeforeClose);
  // 元の detail（親タスク）へ戻っている。
  expect(
    container?.querySelector('[data-testid="detail-back-button"]'),
  ).not.toBeNull();
});

test("経路3b: subIssue → close → board → 通常作成で parentReadOnly=false（stale leak 検出）", async () => {
  mountApp();
  await openProjectWithTasks();

  await clickParentTaskCard();
  await clickSubIssueAddButton();
  expect(lastModalProps().parentReadOnly).toBe(true);

  // 全画面 create では detail が unmount されるため、まず close で detail へ戻り、
  // detail の「← 戻る」で board へ戻ってから通常作成（handleAddTask）へ切り替える。
  // handleAddTask / handleCloseCreateModal の setSubIssueParentPath(undefined) 漏れを検出する。
  const closeBtn = container?.querySelector(
    '[data-testid="mock-task-create-screen-close"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    closeBtn?.click();
  });
  await clickDetailBackButton();
  await clickColumnAddButton("Todo");

  const props = lastModalProps();
  expect(props.parentReadOnly).toBe(false);
  const candidates = props.parentCandidates as Task[];
  expect(candidates.map((t) => t.filePath)).toEqual([
    "tasks/parent.md",
    "tasks/other.md",
  ]);
});
