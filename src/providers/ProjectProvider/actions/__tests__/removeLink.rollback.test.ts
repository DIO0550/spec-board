import { beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { removeLink as removeLinkInvoke, TauriError } from "@/lib/tauri";
import { Result } from "@/utils/result";
import {
  createProjectVersion,
  type ProjectCommandQueue,
} from "../../concurrency";
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

type TaskUpdatedAction = Extract<ProjectAction, { type: "task-updated" }>;

/**
 * task-updated アクションだけを安全にダウンキャストするテスト helper。
 * @param action 対象アクション
 * @returns task-updated アクション
 */
const asTaskUpdated = (
  action: ProjectAction | undefined,
): TaskUpdatedAction => {
  expect(action?.type).toBe("task-updated");
  return action as TaskUpdatedAction;
};

/**
 * Task の fixture を生成する。
 * @param overrides TaskFromPayloadInput の上書き値
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskFromPayloadInput>): Task =>
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
  tasks: [...tasks],
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof removeLinkAction>[0];
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

/**
 * リジェクト用 TauriError を生成する。
 * @returns TauriError
 */
const ioError = () => TauriError.from(new Error("io 失敗"));

beforeEach(() => {
  removeLinkMock.mockReset();
});

test("失敗時 current==optimistic なら source の links が snapshot へ戻る", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  expect(sourceUpdates).toHaveLength(2);
  const rollback = asTaskUpdated(sourceUpdates[1]);
  expect(rollback.task.links.linkedFilePaths).toEqual(["tasks/b.md"]);
});

test("失敗時 current==optimistic なら target の reverseLinks が snapshot へ戻る", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(targetUpdates).toHaveLength(2);
  const rollback = asTaskUpdated(targetUpdates[1]);
  expect(rollback.task.links.reverseLinkedFilePaths).toEqual(["tasks/a.md"]);
});

test("target が cache 不在の場合 target rollback dispatch は呼ばれない", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    links: ["tasks/missing.md"],
  });
  const harness = setupLoaded(makeData([source]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/missing.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) =>
      a.type === "task-updated" && a.originalFilePath === "tasks/missing.md",
  );
  expect(targetUpdates).toHaveLength(0);
});

test("IPC 中に source.linkedFilePaths が外部更新されると source rollback dispatch は skip", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "tasks/extra.md"],
  });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  // IPC 解決前に別経路で source.linkedFilePaths に別 path を追加して current != optimistic を作る。
  removeLinkMock.mockImplementation(async () => {
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

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  // 楽観 dispatch + 別経路 dispatch の 2 件のみ（rollback は skip）
  expect(sourceUpdates).toHaveLength(2);
  const last = asTaskUpdated(sourceUpdates[1]);
  expect(last.task.links.linkedFilePaths).toEqual([
    "tasks/extra.md",
    "tasks/c.md",
  ]);
});

test("IPC 中に target.reverseLinkedFilePaths が外部更新されると target rollback dispatch は skip", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
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

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  // 楽観 dispatch + 別経路 dispatch の 2 件のみ（rollback は skip）
  expect(targetUpdates).toHaveLength(2);
  const last = asTaskUpdated(targetUpdates[1]);
  expect(last.task.links.reverseLinkedFilePaths).toEqual(["tasks/d.md"]);
});

test("source 側 skip & target 側 restore（独立判定）", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));

  // source のみ別経路で更新 → source rollback skip / target rollback restore
  removeLinkMock.mockImplementation(async () => {
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

  await removeLinkAction(harness.deps, {
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
  expect(targetRollback.task.links.reverseLinkedFilePaths).toEqual([
    "tasks/a.md",
  ]);
});
