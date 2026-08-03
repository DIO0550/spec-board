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

const boardWorkspaceSpy = vi.hoisted(() => vi.fn());

vi.mock("@/features/board", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/board")>(
      "@/features/board",
    );
  return {
    ...actual,
    BoardWorkspace: (props: unknown) => {
      boardWorkspaceSpy(props);
      return null;
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
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { App } from "@/App";
import { TaskForest } from "@/domains/task-forest";
import {
  getColumns as getColumnsInvoke,
  openDirectoryDialog,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);

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

const task = Task.fromPayload({
  id: "tasks/a.md",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
});

const taskTree = TaskForest.fromPayload([
  {
    filePath: "tasks/a.md",
    children: [{ filePath: "tasks/b.md", children: [] }],
  },
]);

beforeEach(() => {
  boardWorkspaceSpy.mockClear();
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
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

const clickOpenButton = async () => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openButton = Array.from(buttons).find(
    (button) => button.textContent === "開く",
  ) as HTMLButtonElement | undefined;
  await act(async () => {
    openButton?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/** BoardWorkspace が最後に受け取った taskTree prop。 */
const receivedTaskTree = (): unknown => {
  const calls = boardWorkspaceSpy.mock.calls;
  const last = calls[calls.length - 1]?.[0] as
    | { taskTree?: unknown }
    | undefined;
  return last?.taskTree;
};

const openProjectSuccessfully = async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      session: WATCHER_SESSION_FIXTURE,
      tasks: [task],
      columns: ["Todo", "Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree,
      loadWarnings: [],
    }),
  );
  await clickOpenButton();
};

test("未 open では BoardWorkspace 自体が描画されない", () => {
  mountApp();

  // 未 open / load 中 / error は EmptyState / Loading 側の分岐に入るため、
  // `taskTreeOf` の空 forest は「loaded 以外では消費者が居ない」ことの型上の受け皿。
  // 固定参照であること自体は `TaskForest.empty` の domain テストで担保する。
  expect(boardWorkspaceSpy).not.toHaveBeenCalled();
});

test("loaded では store の taskTree がそのまま渡る", async () => {
  mountApp();

  await openProjectSuccessfully();

  expect(receivedTaskTree()).toEqual(taskTree);
});

test("再レンダーしても loaded の taskTree は同じ参照のまま", async () => {
  mountApp();
  await openProjectSuccessfully();
  const first = receivedTaskTree();

  act(() => {
    root?.render(<App />);
  });

  expect(receivedTaskTree()).toBe(first);
});

test("プロジェクト切替の open が失敗しても旧プロジェクトの taskTree が渡り続ける", async () => {
  mountApp();
  await openProjectSuccessfully();

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  openProjectMock.mockResolvedValueOnce(Result.err(new Error("失敗") as never));
  await clickOpenButton();

  expect(receivedTaskTree()).toEqual(taskTree);
});
