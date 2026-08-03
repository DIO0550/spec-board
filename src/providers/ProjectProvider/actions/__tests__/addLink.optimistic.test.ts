import { beforeEach, expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { addLink as addLinkInvoke, TauriError } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import {
  createProjectVersion,
  type ProjectCommandQueue,
} from "../../concurrency";
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

type TaskUpdatedAction = Extract<ProjectAction, { type: "task-updated" }>;

const asTaskUpdated = (
  action: ProjectAction | undefined,
): TaskUpdatedAction => {
  expect(action?.type).toBe("task-updated");
  return action as TaskUpdatedAction;
};

const expectOk = <T, E>(result: ResultT<T, E>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

const expectErr = <T, E>(result: ResultT<T, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: overrides.title ?? "t",
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
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof addLinkAction>[0];
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

const okTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: "id",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/a.md",
    extras: {},
    warnings: [],
    ...overrides,
  });

beforeEach(() => {
  addLinkMock.mockReset();
});

test("source 楽観 dispatch で linkedFilePaths が即時拡張される", async () => {
  const source = makeTask({ filePath: "tasks/a.md", title: "A" });
  const target = makeTask({ filePath: "tasks/b.md", title: "B" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        links: ["tasks/b.md"],
      }),
    ),
  );

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const firstSourceUpdate = asTaskUpdated(
    harness.actions.find(
      (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
    ),
  );
  expect(firstSourceUpdate.task.links.linkedFilePaths).toEqual(["tasks/b.md"]);
});

test("target 楽観 dispatch で reverseLinkedFilePaths が即時拡張される", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        links: ["tasks/b.md"],
      }),
    ),
  );

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdate = asTaskUpdated(
    harness.actions.find(
      (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
    ),
  );
  expect(targetUpdate.task.links.reverseLinkedFilePaths).toEqual([
    "tasks/a.md",
  ]);
});

test("IPC 成功で source が canonical Task で再 dispatch される", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        title: "canonical",
        links: ["tasks/b.md"],
      }),
    ),
  );

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  expect(sourceUpdates).toHaveLength(2);
  const commit = asTaskUpdated(sourceUpdates[1]);
  expect(commit.task.title).toBe("canonical");
});

test("IPC 成功で target は再 dispatch されない（楽観値据え置き）", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        links: ["tasks/b.md"],
      }),
    ),
  );

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(targetUpdates).toHaveLength(1);
});

test("target 不在は IPC を呼ばず invalid-state で失敗し dispatch もされない", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([source]));

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/missing.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect(addLinkMock).not.toHaveBeenCalled();
  expect(harness.actions).toHaveLength(0);
});

test("self-link は IPC を呼ばず invalid-state で失敗し dispatch もされない", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([source]));

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/a.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect(addLinkMock).not.toHaveBeenCalled();
  expect(harness.actions).toHaveLength(0);
});

test("既にリンク済みなら IPC を呼ばず現行 source で成功する", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const value = expectOk<Task, ProjectError>(result);
  expect(value.links.linkedFilePaths).toEqual(["tasks/b.md"]);
  expect(addLinkMock).not.toHaveBeenCalled();
  expect(harness.actions).toHaveLength(0);
});

test("既存 raw 表記 ./tasks/b.md への canonical add も noop として成功する", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    links: ["./tasks/b.md"],
  });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  expectOk<Task, ProjectError>(result);
  expect(addLinkMock).not.toHaveBeenCalled();
  expect(harness.actions).toHaveLength(0);
});

test("既リンク済みで target reverse が欠落していても noop で成功する（ドリフト残置）", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: [],
  });
  const harness = setupLoaded(makeData([source, target]));

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  expectOk<Task, ProjectError>(result);
  expect(addLinkMock).not.toHaveBeenCalled();
  expect(harness.actions).toHaveLength(0);
});

test("source 不在で invalid-state エラーが返り IPC は呼ばれない", async () => {
  const harness = setupLoaded(makeData([]));

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/missing.md",
    targetFilePath: "tasks/x.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect(addLinkMock).not.toHaveBeenCalled();
});

test("IPC 成功時の Result.ok には canonical source Task が含まれる", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        title: "canonical",
        links: ["tasks/b.md"],
      }),
    ),
  );

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const value = expectOk<Task, ProjectError>(result);
  expect(value.title).toBe("canonical");
  expect(value.links.linkedFilePaths).toEqual(["tasks/b.md"]);
});

test("IPC 失敗時の Result.err は ProjectError.tauri を運ぶ", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.err(TauriError.from(new Error("書き込みに失敗"))),
  );

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("tauri");
});

test("idle state では preflight invalid-state で IPC を呼ばない", async () => {
  const state = { current: { kind: "idle" } as ProjectState };
  const actions: ProjectAction[] = [];
  const queue: ProjectCommandQueue = { current: Promise.resolve() };
  const version = createProjectVersion();
  const deps = {
    projectVersion: version,
    projectCommandQueue: queue,
    getState: () => state.current,
    dispatch: (action: ProjectAction) => {
      actions.push(action);
      state.current = reducer(state.current, action);
    },
  };

  const result = await addLinkAction(deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect(addLinkMock).not.toHaveBeenCalled();
});
