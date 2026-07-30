import { beforeEach, expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
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
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [...tasks],
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
  projections: new Map(),
  milestoneProjections: new Map(),
  openRequestId: 0,
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

/** loaded state から filePath の Task を引き当てる（テスト検証用）。 */
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
  addLinkMock.mockReset();
});

test("失敗時は source の linkedFilePaths から自分の path のみ除去され snapshot 相当へ戻る", async () => {
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

test("失敗時は target の reverseLinkedFilePaths から自分の path のみ除去され snapshot 相当へ戻る", async () => {
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

test("IPC 中の外部追加を保持したまま source から自分の path のみ除去する", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  // IPC 解決前に別経路で source に別 path を追加する（旧実装は rollback 全体を skip していた）。
  addLinkMock.mockImplementation(async () => {
    const current = currentTask(harness, "tasks/a.md");
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: {
        ...current,
        links: {
          ...current.links,
          linkedFilePaths: [...current.links.linkedFilePaths, "tasks/c.md"],
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
  // 楽観 + 別経路 + rollback の 3 件（旧実装の skip から期待値変更）
  expect(sourceUpdates).toHaveLength(3);
  const rollback = asTaskUpdated(sourceUpdates[2]);
  expect(rollback.task.links.linkedFilePaths).toEqual(["tasks/c.md"]);
});

test("楽観 path が外部で既に消えていれば source rollback dispatch は skip される", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
    const current = currentTask(harness, "tasks/a.md");
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: {
        ...current,
        links: { ...current.links, linkedFilePaths: [] },
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
  // 楽観 + 別経路の 2 件のみ（remove は同一参照 → dispatch skip）
  expect(sourceUpdates).toHaveLength(2);
  const last = asTaskUpdated(sourceUpdates[1]);
  expect(last.task.links.linkedFilePaths).toEqual([]);
});

test("rollback は links 以外の field に触れない（外部の title 更新を保持する）", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
    const current = currentTask(harness, "tasks/a.md");
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: { ...current, title: "外部更新" },
    });
    return Result.err(ioError());
  });

  await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  const rolledBack = currentTask(harness, "tasks/a.md");
  expect(rolledBack.title).toBe("外部更新");
  expect(rolledBack.links.linkedFilePaths).toEqual([]);
});

test("add 失敗 + target 外部削除でも楽観 link が残らず削除済み target も復活しない", async () => {
  const source = makeTask({ filePath: "tasks/a.md" });
  const target = makeTask({ filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  addLinkMock.mockImplementation(async () => {
    harness.deps.dispatch({ type: "task-deleted", filePath: "tasks/b.md" });
    return Result.err(ioError());
  });

  const result = await addLinkAction(harness.deps, {
    filePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });

  expect(result.ok).toBe(false);
  // task-deleted の reducer 掃除で source forward は既に除去済みのため
  // rollback の remove は同一参照 → dispatch skip（楽観 dispatch の 1 件のみ）
  const sourceUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/a.md",
  );
  expect(sourceUpdates).toHaveLength(1);
  expect(currentTask(harness, "tasks/a.md").links.linkedFilePaths).toEqual([]);
  // target は state 不在の per-task skip（楽観 dispatch の 1 件のみで復活しない）
  const targetUpdates = harness.actions.filter(
    (a) => a.type === "task-updated" && a.originalFilePath === "tasks/b.md",
  );
  expect(targetUpdates).toHaveLength(1);
  const currentState = harness.state.current as Extract<
    ProjectState,
    { kind: "loaded" }
  >;
  expect(
    currentState.data.tasks.find((t) => t.filePath === "tasks/b.md"),
  ).toBeUndefined();
});
