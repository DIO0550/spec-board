import { beforeEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { removeLink as removeLinkInvoke, TauriError } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
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
    filePath: taskFilePathFixture("tasks/x.md"),
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
      requestResync: () => {},
      dispatch: (action) => {
        actions.push(action);
        state.current = reducer(state.current, action);
      },
    },
  };
};

/**
 * loaded state から filePath の Task を引き当てる（テスト検証用）。
 * @param harness 対象 harness
 * @param filePath 引き当てる filePath
 * @returns 該当 Task
 */
const currentTask = (harness: Harness, filePath: string): Task => {
  const current = harness.state.current as Extract<
    ProjectState,
    { kind: "loaded" }
  >;
  return current.data.tasks.find((t) => t.filePath === filePath) as Task;
};

/** リジェクト用 TauriError を生成する。 */
const ioError = () => TauriError.from(new Error("io 失敗"));

beforeEach(() => {
  removeLinkMock.mockReset();
});

test("失敗時は source forward / target reverse へ自分の path が復元される", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/b.md")]);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/b.md")).links
      .reverseLinkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/a.md")]);
});

test("中間要素の remove 失敗では rollback が元位置へ復元する", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/c.md"),
      taskFilePathFixture("tasks/d.md"),
    ],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/c.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/c.md"),
  });

  // 中間要素 tasks/c.md が元位置（index 1）へ戻る
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/d.md"),
  ]);
});

test("先頭要素の remove 失敗では rollback が先頭位置へ復元する", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/c.md"),
      taskFilePathFixture("tasks/d.md"),
    ],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  // 先頭要素 tasks/b.md が元位置（index 0）へ戻る
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/d.md"),
  ]);
});

test("外部 remove で現在長が at 未満になっていたら末尾へ clamp して復元する", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/c.md"),
      taskFilePathFixture("tasks/d.md"),
    ],
  });
  const harness = setupLoaded(makeData([source]));

  // 楽観除去後（[b, c]）にさらに外部で全要素を除去し、現在長 0 < at(2) の状態で失敗応答。
  removeLinkMock.mockImplementation(async () => {
    const current = currentTask(harness, taskFilePathFixture("tasks/a.md"));
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: taskFilePathFixture("tasks/a.md"),
      task: {
        ...current,
        links: { ...current.links, linkedFilePaths: [] },
      },
    });
    return Result.err(ioError());
  });

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/d.md"),
  });

  // at: 2 だが現在長 0 のため clamp 挿入され、エラーにならない
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/d.md")]);
});

test("broken link の remove 失敗では forward raw が無条件に元位置へ復元される", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: ["./tasks/gone.md", taskFilePathFixture("tasks/b.md")],
  });
  const harness = setupLoaded(makeData([source]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: "./tasks/gone.md",
  });

  // forward append は flag なし = value の task が不在でも復元される（disk との整合を優先）
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual(["./tasks/gone.md", taskFilePathFixture("tasks/b.md")]);
});

test("併存する正規化同値表記は両方除去され rollback で両方元位置へ復元される", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: ["./tasks/b.md", taskFilePathFixture("tasks/x.md"), "tasks\\b.md"],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: "./tasks/b.md",
  });

  // 楽観段階で両表記が除去されている（1 dispatch 目）
  const sourceUpdates = harness.actions.filter(
    (a) =>
      a.type === "task-updated" &&
      a.originalFilePath === taskFilePathFixture("tasks/a.md"),
  );
  expect(asTaskUpdated(sourceUpdates[0]).task.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/x.md"),
  ]);
  // rollback（昇順 append）で両表記が各自の元位置へ戻る
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual(["./tasks/b.md", taskFilePathFixture("tasks/x.md"), "tasks\\b.md"]);
});

test("self-link 削除の失敗時は 1 dispatch で forward / reverse の両方が復元される", async () => {
  const selfTask = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/a.md")],
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([selfTask]));
  removeLinkMock.mockResolvedValue(Result.err(ioError()));

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/a.md"),
  });

  const sourceUpdates = harness.actions.filter(
    (a) =>
      a.type === "task-updated" &&
      a.originalFilePath === taskFilePathFixture("tasks/a.md"),
  );
  // 楽観 1 + rollback 1 の 2 件（rollback は両 field を 1 dispatch で復元）
  expect(sourceUpdates).toHaveLength(2);
  const rollback = asTaskUpdated(sourceUpdates[1]);
  expect(rollback.task.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/a.md"),
  ]);
  expect(rollback.task.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("IPC 中の外部変更（別 path 追加）を保持したまま自分の path が復活する", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
    const current = currentTask(harness, taskFilePathFixture("tasks/a.md"));
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: taskFilePathFixture("tasks/a.md"),
      task: {
        ...current,
        links: {
          ...current.links,
          linkedFilePaths: [
            ...current.links.linkedFilePaths,
            taskFilePathFixture("tasks/c.md"),
          ],
        },
      },
    });
    return Result.err(ioError());
  });

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  // 外部追加 tasks/c.md を保持しつつ、自分の path が元位置（先頭）へ復活
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("楽観除去した path が外部で復活済みなら rollback dispatch は skip される", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
    const current = currentTask(harness, taskFilePathFixture("tasks/a.md"));
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: taskFilePathFixture("tasks/a.md"),
      task: {
        ...current,
        links: {
          ...current.links,
          linkedFilePaths: [taskFilePathFixture("tasks/b.md")],
        },
      },
    });
    return Result.err(ioError());
  });

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  const sourceUpdates = harness.actions.filter(
    (a) =>
      a.type === "task-updated" &&
      a.originalFilePath === taskFilePathFixture("tasks/a.md"),
  );
  // 楽観 + 外部復活の 2 件のみ（append は同一参照 → rollback dispatch なし）
  expect(sourceUpdates).toHaveLength(2);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/b.md")]);
});

test("rollback 時に target が削除済みなら target は skip され source forward は復元される", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
    harness.deps.dispatch({
      type: "task-deleted",
      filePath: taskFilePathFixture("tasks/b.md"),
    });
    return Result.err(ioError());
  });

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  // forward append は flag なしのため target 消失後も復元される（broken link として表示される）
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/b.md")]);
  // target への rollback dispatch は per-task skip（楽観 dispatch の 1 件のみ）
  const targetUpdates = harness.actions.filter(
    (a) =>
      a.type === "task-updated" &&
      a.originalFilePath === taskFilePathFixture("tasks/b.md"),
  );
  expect(targetUpdates).toHaveLength(1);
});

test("remove 失敗 + source 外部削除では削除済み source への逆リンクを復活させない", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));

  removeLinkMock.mockImplementation(async () => {
    harness.deps.dispatch({
      type: "task-deleted",
      filePath: taskFilePathFixture("tasks/a.md"),
    });
    return Result.err(ioError());
  });

  await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  // 参照整合ガード（reverse append のみ requiresValueTask 付き）により
  // 削除済み source への逆リンク re-append は skip される
  expect(
    currentTask(harness, taskFilePathFixture("tasks/b.md")).links
      .reverseLinkedFilePaths,
  ).toEqual([]);
});
