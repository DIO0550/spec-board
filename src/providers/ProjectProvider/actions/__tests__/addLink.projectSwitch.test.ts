import { beforeEach, expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { addLink as addLinkInvoke, TauriError } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import {
  createProjectVersion,
  invalidateProject,
  type ProjectCommandQueue,
} from "../../concurrency";
import { PROJECT_SWITCHED_MESSAGE } from "../../constants";
import type { ProjectError } from "../../errors";
import type { ProjectAction, ProjectData } from "../../reducer";
import { reducer } from "../../reducer";
import type { ProjectState } from "../../state/projectState";
import { addLinkAction } from "../addLink";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    addLink: vi.fn(),
  };
});

const addLinkMock = vi.mocked(addLinkInvoke);

const expectErr = <T, E>(result: ResultT<T, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

const makeData = (tasks: readonly Task[]): ProjectData => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [...tasks],
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
  projections: new Map(),
  openRequestId: 0,
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof addLinkAction>[0];
  version: ReturnType<typeof createProjectVersion>;
};

const setupLoaded = (data: ProjectData): Harness => {
  const state = {
    current: { kind: "loaded", path: "/p", data } as ProjectState,
  };
  const actions: ProjectAction[] = [];
  const queue: ProjectCommandQueue = { current: Promise.resolve() };
  const version = createProjectVersion();
  return {
    state,
    actions,
    version,
    deps: {
      projectVersion: version,
      projectCommandQueue: queue,
      getState: () => state.current,
      dispatch: (action) => {
        actions.push(action);
        state.current = reducer(state.current, action);
      },
    },
  };
};

beforeEach(() => {
  addLinkMock.mockReset();
});

test("queue 内 preflight で version 不一致なら invalid-state (PROJECT_SWITCHED_MESSAGE) で IPC は呼ばれない", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  // queue 開始前 (capture 済み) → queue 内に入る前に version を進める
  const promise = addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });
  invalidateProject(harness.version);

  const result = await promise;
  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect((error as { kind: "invalid-state"; message: string }).message).toBe(
    PROJECT_SWITCHED_MESSAGE,
  );
  expect(addLinkMock).not.toHaveBeenCalled();
});

test("rollback 前 version 不一致なら rollback dispatch も skip して invalid-state を返す", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  // IPC は失敗を返すが、その直前で version を進めて rollback ブロック前 guard を発火させる。
  addLinkMock.mockImplementation(async () => {
    invalidateProject(harness.version);
    return Result.err(TauriError.from(new Error("io")));
  });

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  // 楽観 dispatch (source/target 各 1) のみで、rollback dispatch は走らない
  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(sourceUpdates).toHaveLength(1);
  expect(targetUpdates).toHaveLength(1);
  // confirm / rollback 由来の dispatch が一切なく、新 project state を変更しない
  expect(harness.actions).toHaveLength(2);
});

test("IPC 直後 version 不一致なら commit dispatch されず invalid-state", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
    invalidateProject(harness.version);
    return Result.ok(
      Task.fromPayload({
        id: "tasks/a.md",
        title: "canonical",
        status: "Todo",
        labels: [],
        links: ["tasks/b.md"],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "tasks/a.md",
        extras: {},
        warnings: [],
      }),
    );
  });

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  // canonical commit dispatch は実行されていない（楽観 dispatch までで止まる）
  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  expect(sourceUpdates).toHaveLength(1);
});
