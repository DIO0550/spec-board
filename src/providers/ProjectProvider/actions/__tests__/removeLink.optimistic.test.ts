import { beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { removeLink as removeLinkInvoke, TauriError } from "@/lib/tauri";
import { Result, type Result as ResultT } from "@/utils/result";
import {
  createProjectVersion,
  type ProjectCommandQueue,
} from "../../concurrency";
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
 * Result.ok を assert しつつ値を取り出す。
 * @param result 対象 Result
 * @returns Result.ok の値
 */
const expectOk = <T, E>(result: ResultT<T, E>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

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
 * @param overrides TaskFromPayloadInput の上書き値
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskFromPayloadInput>): Task =>
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
 * canonical Task の fixture を生成する。
 * @param overrides TaskFromPayloadInput の上書き値
 * @returns Task
 */
const okTask = (overrides: Partial<TaskFromPayloadInput>): Task =>
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
  removeLinkMock.mockReset();
});

test("source 楽観 dispatch で linkedFilePaths から target が消える", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    title: "A",
    links: ["tasks/b.md"],
  });
  const target = makeTask({
    filePath: "tasks/b.md",
    title: "B",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(
    Result.ok(okTask({ id: "tasks/a.md", filePath: "tasks/a.md", links: [] })),
  );

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const firstSourceUpdate = asTaskUpdated(
    harness.actions.find(
      (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
    ),
  );
  expect(firstSourceUpdate.task.links.linkedFilePaths).toEqual([]);
});

test("target 楽観 dispatch で reverseLinkedFilePaths から source が消える", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(
    Result.ok(okTask({ id: "tasks/a.md", filePath: "tasks/a.md", links: [] })),
  );

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdate = asTaskUpdated(
    harness.actions.find(
      (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
    ),
  );
  expect(targetUpdate.task.links.reverseLinkedFilePaths).toEqual([]);
});

test("IPC 成功で source が canonical Task で再 dispatch される", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        title: "canonical",
        links: [],
      }),
    ),
  );

  await removeLinkAction(harness.deps, {
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
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(
    Result.ok(okTask({ id: "tasks/a.md", filePath: "tasks/a.md", links: [] })),
  );

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(targetUpdates).toHaveLength(1);
});

test("target が cache 不在の場合 target 楽観 dispatch は呼ばれない", async () => {
  const source = makeTask({
    filePath: "tasks/a.md",
    links: ["tasks/missing.md"],
  });
  const harness = setupLoaded(makeData([source]));
  removeLinkMock.mockResolvedValue(
    Result.ok(okTask({ id: "tasks/a.md", filePath: "tasks/a.md", links: [] })),
  );

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

test("source 不在で invalid-state エラーが返り IPC は呼ばれない", async () => {
  const harness = setupLoaded(makeData([]));

  const result = await removeLinkAction(harness.deps, {
    filePath: "tasks/missing.md",
    targetFilePath: "tasks/x.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect(removeLinkMock).not.toHaveBeenCalled();
});

test("IPC 成功時の Result.ok には canonical source Task が含まれる", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        title: "canonical",
        links: [],
      }),
    ),
  );

  const result = await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const value = expectOk<Task, ProjectError>(result);
  expect(value.title).toBe("canonical");
  expect(value.links.linkedFilePaths).toEqual([]);
});

test("IPC 失敗時の Result.err は ProjectError.tauri を運ぶ", async () => {
  const source = makeTask({ filePath: "tasks/a.md", links: ["tasks/b.md"] });
  const target = makeTask({
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(
    Result.err(TauriError.from(new Error("書き込みに失敗"))),
  );

  const result = await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("tauri");
});

test("self-link 削除では source 側 1 回の dispatch で linkedFilePaths と reverseLinkedFilePaths の両方が消える", async () => {
  // self-link: A.links が [A] かつ A.reverseLinks も [A] の状態
  const selfTask = makeTask({
    filePath: "tasks/a.md",
    title: "A",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([selfTask]));
  removeLinkMock.mockResolvedValue(
    Result.ok(
      okTask({
        id: "tasks/a.md",
        filePath: "tasks/a.md",
        links: [],
        reverseLinks: [],
      }),
    ),
  );

  await removeLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/a.md",
  });

  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  // 楽観 dispatch (1) + canonical 再 dispatch (1) = 2
  expect(sourceUpdates).toHaveLength(2);
  const optimistic = asTaskUpdated(sourceUpdates[0]);
  expect(optimistic.task.links.linkedFilePaths).toEqual([]);
  expect(optimistic.task.links.reverseLinkedFilePaths).toEqual([]);
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

  const result = await removeLinkAction(deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error.kind).toBe("invalid-state");
  expect(removeLinkMock).not.toHaveBeenCalled();
});
