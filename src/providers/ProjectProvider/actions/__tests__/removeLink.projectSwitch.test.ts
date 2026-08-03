import { beforeEach, expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { removeLink as removeLinkInvoke, TauriError } from "@/lib/tauri";
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
import { removeLinkAction } from "../removeLink";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    removeLink: vi.fn(),
  };
});

const removeLinkMock = vi.mocked(removeLinkInvoke);

/**
 * Result.err を assert しつつ error を取り出す。
 * @param result 対象 Result
 * @returns Result.err の error
 */
const expectErr = <T, E>(result: ResultT<T, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

/**
 * Task の fixture を生成する。
 * @param overrides TaskPayload の上書き値
 * @returns Task
 */
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

/**
 * ProjectData を生成する。
 * @param tasks 含める task 配列
 * @returns ProjectData
 */
const makeData = (tasks: readonly Task[]): ProjectData => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [...tasks],
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof removeLinkAction>[0];
  version: ReturnType<typeof createProjectVersion>;
};

/**
 * loaded 状態の harness を作る。
 * @param data 初期 ProjectData
 * @returns Harness
 */
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
  removeLinkMock.mockReset();
});

test("queue 内 preflight で version 不一致なら invalid-state (PROJECT_SWITCHED_MESSAGE) で IPC は呼ばれない", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  const promise = removeLinkAction(harness.deps, {
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
  expect(removeLinkMock).not.toHaveBeenCalled();
});

test("rollback 前 version 不一致なら rollback dispatch も skip して invalid-state を返す", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
    invalidateProject(harness.version);
    return Result.err(TauriError.from(new Error("io")));
  });

  const result = await removeLinkAction(harness.deps, {
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
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
    invalidateProject(harness.version);
    return Result.ok(
      Task.fromPayload({
        id: "tasks/a.md",
        title: "canonical",
        status: "Todo",
        labels: [],
        links: [],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "tasks/a.md",
        extras: {},
        warnings: [],
      }),
    );
  });

  const result = await removeLinkAction(harness.deps, {
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
