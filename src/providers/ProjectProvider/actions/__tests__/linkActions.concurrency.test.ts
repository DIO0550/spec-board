import { beforeEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  addLink as addLinkInvoke,
  removeLink as removeLinkInvoke,
  TauriError,
} from "@/lib/tauri";
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
import { removeLinkAction } from "../removeLink";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    addLink: vi.fn(),
    removeLink: vi.fn(),
  };
});

const addLinkMock = vi.mocked(addLinkInvoke);
const removeLinkMock = vi.mocked(removeLinkInvoke);

/** addLink invoke の解決値型（deferred mock 用）。 */
type AddInvokeResult = Awaited<ReturnType<typeof addLinkInvoke>>;

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
 * @param overrides TaskPayload の上書き値
 * @returns Task
 */
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
  version: ReturnType<typeof createProjectVersion>;
  deps: Parameters<typeof addLinkAction>[0];
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

beforeEach(() => {
  addLinkMock.mockReset();
  removeLinkMock.mockReset();
});

test("同一 pair への add と remove を await せず連続発行しても最終 state が remove 後の整合状態になる", async () => {
  const source = makeTask({ filePath: taskFilePathFixture("tasks/a.md") });
  const target = makeTask({ filePath: taskFilePathFixture("tasks/b.md") });
  const harness = setupLoaded(makeData([source, target]));
  // 先行 add の IPC を deferred にし、解決するまで後続 remove が開始されないことで
  // queue の直列化そのものを証明する（即時解決だと queue なしでも期待値を満たし得る）。
  let resolveAdd: ((result: AddInvokeResult) => void) | undefined;
  addLinkMock.mockImplementation(
    () =>
      new Promise<AddInvokeResult>((resolve) => {
        resolveAdd = resolve;
      }),
  );
  removeLinkMock.mockResolvedValue(
    Result.ok(
      makeTask({ filePath: taskFilePathFixture("tasks/a.md"), links: [] }),
    ),
  );

  const first = addLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  const second = removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  // 先行 add が IPC 待ちの間、後続 remove の invoke は開始されない（queue 直列化）
  await vi.waitFor(() => {
    expect(addLinkMock).toHaveBeenCalledTimes(1);
  });
  expect(removeLinkMock).not.toHaveBeenCalled();

  resolveAdd?.(
    Result.ok(
      makeTask({
        filePath: taskFilePathFixture("tasks/a.md"),
        links: [taskFilePathFixture("tasks/b.md")],
      }),
    ),
  );
  const [addResult, removeResult] = await Promise.all([first, second]);

  expectOk<Task, ProjectError>(addResult);
  expectOk<Task, ProjectError>(removeResult);
  // queue 直列化により remove の plan は add 確定後の state から計算される
  expect(addLinkMock).toHaveBeenCalledTimes(1);
  expect(removeLinkMock).toHaveBeenCalledTimes(1);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([]);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/b.md")).links
      .reverseLinkedFilePaths,
  ).toEqual([]);
});

test("同一 pair への add 2 連発の 2 回目は noop になり IPC は 1 回のみ", async () => {
  const source = makeTask({ filePath: taskFilePathFixture("tasks/a.md") });
  const target = makeTask({ filePath: taskFilePathFixture("tasks/b.md") });
  const harness = setupLoaded(makeData([source, target]));
  addLinkMock.mockResolvedValue(
    Result.ok(
      makeTask({
        filePath: taskFilePathFixture("tasks/a.md"),
        links: [taskFilePathFixture("tasks/b.md")],
      }),
    ),
  );

  const first = addLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  const second = addLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  expectOk<Task, ProjectError>(firstResult);
  expectOk<Task, ProjectError>(secondResult);
  expect(addLinkMock).toHaveBeenCalledTimes(1);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/b.md")]);
});

test("stale 失敗応答: IPC 中の watcher 相当の外部追加を rollback が保持する", async () => {
  const source = makeTask({ filePath: taskFilePathFixture("tasks/a.md") });
  const target = makeTask({ filePath: taskFilePathFixture("tasks/b.md") });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
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
            taskFilePathFixture("tasks/watcher.md"),
          ],
        },
      },
    });
    return Result.err(TauriError.from(new Error("io 失敗")));
  });

  const result = await addLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  expectErr<Task, ProjectError>(result);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/watcher.md")]);
});

test("stale 失敗応答: IPC 中の links 以外の外部 field 更新が rollback 後も残る", async () => {
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
      task: { ...current, title: "外部更新済み" },
    });
    return Result.err(TauriError.from(new Error("io 失敗")));
  });

  const result = await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  expectErr<Task, ProjectError>(result);
  const rolledBack = currentTask(harness, taskFilePathFixture("tasks/a.md"));
  expect(rolledBack.title).toBe("外部更新済み");
  expect(rolledBack.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/b.md"),
  ]);
});

/**
 * 「旧 project と同じ filePath の task を持つ」新 project state を作る。
 * 誤った rollback / confirm dispatch が届けば sentinel の links / title が変化するため、
 * 汚染をテストで検出できる。
 * @returns 新 project の sentinel 2 task
 */
const makeNewProjectSentinels = (): { source: Task; target: Task } => ({
  source: makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    title: "新プロジェクトA",
    links: [taskFilePathFixture("tasks/keep.md")],
  }),
  target: makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    title: "新プロジェクトB",
    reverseLinks: [taskFilePathFixture("tasks/keep.md")],
  }),
});

test("stale 応答前の project 切替では新 project state を一切変更しない（add）", async () => {
  const source = makeTask({ filePath: taskFilePathFixture("tasks/a.md") });
  const target = makeTask({ filePath: taskFilePathFixture("tasks/b.md") });
  const harness = setupLoaded(makeData([source, target]));
  const sentinels = makeNewProjectSentinels();
  let actionsAtSwitch = 0;

  addLinkMock.mockImplementation(async () => {
    // project 切替相当: version 更新 + 同一 filePath の task を持つ新 project state へ差し替え
    invalidateProject(harness.version);
    harness.state.current = {
      kind: "loaded",
      path: "/new",
      data: makeData([sentinels.source, sentinels.target]),
    } as ProjectState;
    actionsAtSwitch = harness.actions.length;
    return Result.err(TauriError.from(new Error("io 失敗")));
  });

  const result = await addLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error).toMatchObject({
    kind: "invalid-state",
    reason: "project-switched",
    message: PROJECT_SWITCHED_MESSAGE,
  });
  // 切替後に confirm / rollback の dispatch が積まれていない
  expect(harness.actions).toHaveLength(actionsAtSwitch);
  // 同一 filePath の sentinel が rollback（remove）で汚染されていない
  const newSource = currentTask(harness, taskFilePathFixture("tasks/a.md"));
  expect(newSource.title).toBe("新プロジェクトA");
  expect(newSource.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/keep.md"),
  ]);
  const newTarget = currentTask(harness, taskFilePathFixture("tasks/b.md"));
  expect(newTarget.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/keep.md"),
  ]);
});

test("stale 応答前の project 切替では新 project state を一切変更しない（remove）", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));
  const sentinels = makeNewProjectSentinels();
  let actionsAtSwitch = 0;

  removeLinkMock.mockImplementation(async () => {
    invalidateProject(harness.version);
    harness.state.current = {
      kind: "loaded",
      path: "/new",
      data: makeData([sentinels.source, sentinels.target]),
    } as ProjectState;
    actionsAtSwitch = harness.actions.length;
    return Result.err(TauriError.from(new Error("io 失敗")));
  });

  const result = await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  const error = expectErr<Task, ProjectError>(result);
  expect(error).toMatchObject({
    kind: "invalid-state",
    reason: "project-switched",
    message: PROJECT_SWITCHED_MESSAGE,
  });
  expect(harness.actions).toHaveLength(actionsAtSwitch);
  // 同一 filePath の sentinel が rollback（re-append）で汚染されていない
  const newSource = currentTask(harness, taskFilePathFixture("tasks/a.md"));
  expect(newSource.title).toBe("新プロジェクトA");
  expect(newSource.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/keep.md"),
  ]);
  const newTarget = currentTask(harness, taskFilePathFixture("tasks/b.md"));
  expect(newTarget.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/keep.md"),
  ]);
});

test("post-write failure 相当の Err でも inverse rollback が適用される", async () => {
  const source = makeTask({
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const harness = setupLoaded(makeData([source, target]));
  // FE は文字列エラー契約のため pre/post-write を判別できず、すべての Err に rollback を適用する
  removeLinkMock.mockResolvedValue(
    Result.err(TauriError.from(new Error("SourceVanished: tasks/a.md"))),
  );

  const result = await removeLinkAction(harness.deps, {
    filePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });

  expectErr<Task, ProjectError>(result);
  // disk では削除済みでも FE cache には復元される（canonical 再収束までの一時乖離が既知の限界）
  expect(
    currentTask(harness, taskFilePathFixture("tasks/a.md")).links
      .linkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/b.md")]);
  expect(
    currentTask(harness, taskFilePathFixture("tasks/b.md")).links
      .reverseLinkedFilePaths,
  ).toEqual([taskFilePathFixture("tasks/a.md")]);
});
