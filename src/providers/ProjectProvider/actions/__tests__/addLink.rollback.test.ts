import { beforeEach, expect, test, vi } from "vitest";
import { addLink as addLinkInvoke, TauriError } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import {
  createProjectVersion,
  type ProjectCommandQueue,
} from "../../concurrency";
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
  tasks: [...tasks],
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
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

/** リジェクト用 TauriError を生成する。 */
const ioError = () => TauriError.from(new Error("io 失敗"));

beforeEach(() => {
  addLinkMock.mockReset();
});

test("失敗時 current==optimistic なら source の links が snapshot へ戻る", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(Result.err(ioError()));

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  expect(sourceUpdates).toHaveLength(2);
  const rollback = asTaskUpdated(sourceUpdates[1]);
  expect(rollback.task.links.linkedFilePaths).toEqual([]);
});

test("失敗時 current==optimistic なら target の reverseLinks が snapshot へ戻る", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(Result.err(ioError()));

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(targetUpdates).toHaveLength(2);
  const rollback = asTaskUpdated(targetUpdates[1]);
  expect(rollback.task.links.reverseLinkedFilePaths).toEqual([]);
});

test("target が cache 不在の場合 target rollback dispatch は呼ばれない", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([source]));
  addLinkMock.mockResolvedValue(Result.err(ioError()));

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/missing.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) =>
      a.type === "task-updated" && a.originalFilePath === "tasks/missing.md",
  );
  expect(targetUpdates).toHaveLength(0);
});

test("IPC 中に source.linkedFilePaths に別 path 追加されると source rollback dispatch は skip", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  // IPC 解決前に別経路で source に別 path を追加して current != optimistic を作る。
  addLinkMock.mockImplementation(async () => {
    const current = harness.state.current as Extract<
      ProjectState,
      { kind: "loaded" }
    >;
    const currentSource = current.data.tasks.find(
      (t) => t.filePath === "tasks/a.md",
    ) as Task;
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: {
        ...currentSource,
        links: {
          ...currentSource.links,
          linkedFilePaths: [
            ...currentSource.links.linkedFilePaths,
            "tasks/c.md",
          ],
        },
      },
    });
    return Result.err(ioError());
  });

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  // 楽観 dispatch + 別経路 dispatch の 2 件のみ（rollback は skip）
  expect(sourceUpdates).toHaveLength(2);
  const last = asTaskUpdated(sourceUpdates[1]);
  expect(last.task.links.linkedFilePaths).toEqual(["tasks/b.md", "tasks/c.md"]);
});

test("IPC 中に target.reverseLinkedFilePaths に別 path 追加されると target rollback dispatch は skip", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
    const current = harness.state.current as Extract<
      ProjectState,
      { kind: "loaded" }
    >;
    const currentTarget = current.data.tasks.find(
      (t) => t.filePath === "tasks/b.md",
    ) as Task;
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/b.md",
      task: {
        ...currentTarget,
        links: {
          ...currentTarget.links,
          reverseLinkedFilePaths: [
            ...currentTarget.links.reverseLinkedFilePaths,
            "tasks/d.md",
          ],
        },
      },
    });
    return Result.err(ioError());
  });

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  // 楽観 dispatch + 別経路 dispatch の 2 件のみ（rollback は skip）
  expect(targetUpdates).toHaveLength(2);
  const last = asTaskUpdated(targetUpdates[1]);
  expect(last.task.links.reverseLinkedFilePaths).toEqual([
    "tasks/a.md",
    "tasks/d.md",
  ]);
});

test("source 側 skip & target 側 restore（独立判定）", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  // source のみ別経路で更新 → source rollback skip / target rollback restore
  addLinkMock.mockImplementation(async () => {
    const current = harness.state.current as Extract<
      ProjectState,
      { kind: "loaded" }
    >;
    const currentSource = current.data.tasks.find(
      (t) => t.filePath === "tasks/a.md",
    ) as Task;
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: {
        ...currentSource,
        links: {
          ...currentSource.links,
          linkedFilePaths: [
            ...currentSource.links.linkedFilePaths,
            "tasks/c.md",
          ],
        },
      },
    });
    return Result.err(ioError());
  });

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(sourceUpdates).toHaveLength(2); // 楽観 + 別経路、rollback skip
  expect(targetUpdates).toHaveLength(2); // 楽観 + rollback restore
  const targetRollback = asTaskUpdated(targetUpdates[1]);
  expect(targetRollback.task.links.reverseLinkedFilePaths).toEqual([]);
});

test("IPC 中に楽観 path が消えていた場合 source rollback dispatch は skip", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
    const current = harness.state.current as Extract<
      ProjectState,
      { kind: "loaded" }
    >;
    const currentSource = current.data.tasks.find(
      (t) => t.filePath === "tasks/a.md",
    ) as Task;
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: {
        ...currentSource,
        links: { ...currentSource.links, linkedFilePaths: [] },
      },
    });
    return Result.err(ioError());
  });

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  expect(sourceUpdates).toHaveLength(2);
  const last = asTaskUpdated(sourceUpdates[1]);
  expect(last.task.links.linkedFilePaths).toEqual([]);
});
