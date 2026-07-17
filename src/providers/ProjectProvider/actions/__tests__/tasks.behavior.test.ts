import { beforeEach, expect, test, vi } from "vitest";
import { TauriError, updateTask as updateTaskInvoke } from "@/lib/tauri";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { Result } from "@/utils/result";
import {
  createProjectVersion,
  invalidateProject,
  type ProjectCommandQueue,
} from "../../concurrency";
import type { ProjectAction, ProjectData } from "../../reducer";
import type { ProjectState } from "../../state/projectState";
import { reducer } from "../../reducer";
import { updateTaskAction } from "../tasks";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    updateTask: vi.fn(),
  };
});

const updateTaskMock = vi.mocked(updateTaskInvoke);

/**
 * Task payload を最小限の overrides で生成するテストヘルパ。
 * @param overrides 上書きする TaskFromPayloadInput フィールド
 * @returns 楽観テストで扱う Task
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
 * 単一 task と Todo / Done カラムから ProjectData を組み立てるヘルパ。
 */
const makeData = (tasks: readonly Task[]): ProjectData => ({
  tasks: tasks.map((t) => t),
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof updateTaskAction>[0];
};

/**
 * loaded 状態の updateTaskAction 実行に必要な harness を組み立てる。
 * @param data 初期 ProjectData
 * @returns harness
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

const setupIdle = (): Harness => {
  const state = { current: { kind: "idle" } as ProjectState };
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

beforeEach(() => {
  updateTaskMock.mockReset();
});

// === 正常系: 楽観 dispatch ===

test("status 変更で楽観 dispatch が IPC await 前に発火する", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const harness = setupLoaded(makeData([taskA]));

  let optimisticSeen: Task | null = null;
  updateTaskMock.mockImplementation(async () => {
    const data = (harness.state.current as { data: ProjectData }).data;
    optimisticSeen =
      data.tasks.find((t) => t.filePath === "tasks/a.md") ?? null;
    return Result.ok({ ...taskA, status: "Doing" });
  });

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  expect(optimisticSeen).not.toBeNull();
  expect((optimisticSeen as unknown as Task).status).toBe("Doing");
});

test("成功時、楽観 dispatch + 確定 dispatch の 2 回 dispatch される", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const confirmed = makeTask({
    filePath: "tasks/a.md",
    status: "Doing",
    title: "from-be",
  });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok(confirmed));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(2);
  expect((taskUpdates[0] as { task: Task }).task.status).toBe("Doing");
  expect((taskUpdates[0] as { task: Task }).task.title).toBe("t");
  expect((taskUpdates[1] as { task: Task }).task).toBe(confirmed);
  const finalTasks = (harness.state.current as { data: ProjectData }).data
    .tasks;
  expect(finalTasks[0].title).toBe("from-be");
});

// === 正常系: priority バリエーション ===

test("priority undefined → value への変更が楽観反映される", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(
    Result.ok({ ...taskA, priority: "High" as const }),
  );

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    priority: "High",
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect((taskUpdates[0] as { task: Task }).task.priority).toBe("High");
});

test("priority: undefined を明示的に渡しても楽観 dispatch から除外される", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", priority: "High" });
  const harness = setupLoaded(makeData([taskA]));
  // BE は priority クリアをサポートしないため High のまま返ってくる想定
  updateTaskMock.mockResolvedValue(Result.ok(taskA));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    priority: undefined,
    status: "Doing",
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  // 楽観 dispatch では priority は変更されない（High のまま）。status のみ Doing 反映。
  expect((taskUpdates[0] as { task: Task }).task.priority).toBe("High");
  expect((taskUpdates[0] as { task: Task }).task.status).toBe("Doing");
});

test("priority 以外のフィールドも undefined 明示は楽観対象から除外される (status / title / labels / body)", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo", title: "orig" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok(taskA));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: undefined,
    title: undefined,
    labels: undefined,
    body: undefined,
  });

  // 全フィールドが undefined → 楽観 dispatch は skip され、確定 dispatch (BE 戻り) のみ
  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(1);
  expect((taskUpdates[0] as { task: Task }).task).toBe(taskA);
});

// === 正常系: 共有経路（title / labels） ===

test("title 変更も同じ楽観経路で動く", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", title: "old" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok({ ...taskA, title: "new" }));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    title: "new",
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(2);
  expect((taskUpdates[0] as { task: Task }).task.title).toBe("new");
});

test("labels 変更も楽観反映される", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", labels: ["a"] });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(
    Result.ok({ ...taskA, labels: ["a", "b"] }),
  );

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    labels: ["a", "b"],
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect((taskUpdates[0] as { task: Task }).task.labels).toEqual(["a", "b"]);
});

// === 境界値 ===

test("currentTask が見つからない場合 invalid-state Err、dispatch なし", async () => {
  const harness = setupLoaded(makeData([makeTask({ filePath: "tasks/a.md" })]));

  const result = await updateTaskAction(harness.deps, {
    filePath: "tasks/missing.md",
    status: "Doing",
  });

  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(harness.actions).toHaveLength(0);
  expect(updateTaskMock).not.toHaveBeenCalled();
});

test("canAcceptDataCommand=false (idle) で invalid-state Err、dispatch なし", async () => {
  const harness = setupIdle();

  const result = await updateTaskAction(harness.deps, {
    filePath: "tasks/x.md",
    status: "Doing",
  });

  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(harness.actions).toHaveLength(0);
  expect(updateTaskMock).not.toHaveBeenCalled();
});

test("params が filePath のみ（楽観対象キーなし）→ 楽観 dispatch skip、IPC 成功時に確定 dispatch のみ", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok(taskA));

  await updateTaskAction(harness.deps, { filePath: "tasks/a.md" });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(1);
  expect((taskUpdates[0] as { task: Task }).task).toBe(taskA);
});

test("params が { filePath, parent } のみ → 楽観 dispatch skip、確定 dispatch のみ", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok(taskA));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    parent: "tasks/parent.md",
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(1);
  expect((taskUpdates[0] as { task: Task }).task).toBe(taskA);
});

test("params.parent と status を同時に渡しても、楽観 task の hierarchy.parentFilePath は元のまま（parent は楽観対象外）", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", parent: "tasks/old.md" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok(taskA));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
    parent: "tasks/new.md",
  });

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect((taskUpdates[0] as { task: Task }).task.status).toBe("Doing");
  expect(
    (taskUpdates[0] as { task: Task }).task.hierarchy.parentFilePath,
  ).toBe("tasks/old.md");
});

// === 異常系: rollback ===

test("IPC 失敗時、楽観 → rollback の 2 段 dispatch、更新キーが snapshot 値に戻る", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(
    Result.err(new TauriError("IO_ERROR", "io")),
  );

  const result = await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  expect(result.ok).toBe(false);
  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(2);
  expect((taskUpdates[0] as { task: Task }).task.status).toBe("Doing");
  expect((taskUpdates[1] as { task: Task }).task.status).toBe("Todo");
  const finalTasks = (harness.state.current as { data: ProjectData }).data
    .tasks;
  expect(finalTasks[0].status).toBe("Todo");
});

test("IPC 失敗時 rollback で ProjectError.tauri を返す", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([taskA]));
  const err = new TauriError("IO_ERROR", "io");
  updateTaskMock.mockResolvedValue(Result.err(err));

  const result = await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string; error?: TauriError } }).error).toEqual(
    {
      kind: "tauri",
      error: err,
    },
  );
});

// === エッジ: concurrent 保護 (キー単位) ===

test("rollback 時、外部 listener が同じキー (status) を別値に上書き済みなら rollback を skip し外部値を保護", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockImplementation(async () => {
    // IPC 中に外部 listener が status を Done に上書きしたシナリオ
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: { ...taskA, status: "Done" },
    });
    return Result.err(new TauriError("IO_ERROR", "io"));
  });

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  // 楽観 (status: Doing) → 外部 (status: Done) → rollback skip
  const finalTasks = (harness.state.current as { data: ProjectData }).data
    .tasks;
  expect(finalTasks[0].status).toBe("Done");
  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  // dispatch: 楽観 + 外部 listener の 2 件。rollback は skip。
  expect(taskUpdates).toHaveLength(2);
});

test("rollback 時、外部 listener が別キー (title) だけ更新済みなら、更新キー (status) は snapshot に戻し外部キーは保護", async () => {
  const taskA = makeTask({
    filePath: "tasks/a.md",
    status: "Todo",
    title: "orig-title",
  });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockImplementation(async () => {
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: { ...taskA, status: "Doing", title: "external-title" },
    });
    return Result.err(new TauriError("IO_ERROR", "io"));
  });

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  const finalTasks = (harness.state.current as { data: ProjectData }).data
    .tasks;
  // status は snapshot (Todo) に戻り、title は外部値 (external-title) を保護
  expect(finalTasks[0].status).toBe("Todo");
  expect(finalTasks[0].title).toBe("external-title");
});

test("rollback 時、labels 配列が外部更新で変わっていれば labels は skip", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", labels: ["a"] });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockImplementation(async () => {
    harness.deps.dispatch({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: { ...taskA, labels: ["external"] },
    });
    return Result.err(new TauriError("IO_ERROR", "io"));
  });

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    labels: ["a", "b"],
  });

  const finalTasks = (harness.state.current as { data: ProjectData }).data
    .tasks;
  // 外部 listener が labels を ["external"] に書き換えたため rollback skip
  expect(finalTasks[0].labels).toEqual(["external"]);
});

// === エッジ: projectVersion 切替 ===

test("IPC await 中に projectVersion 切替 → rollback skip + invalid-state Err", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockImplementation(async () => {
    invalidateProject(harness.deps.projectVersion);
    return Result.err(new TauriError("IO_ERROR", "io"));
  });

  const result = await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });

  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  // 楽観 dispatch のみで rollback dispatch は流れない
  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  expect(taskUpdates).toHaveLength(1);
});

// === エッジ: idempotency (二重 dispatch) ===

test("BE 確定 dispatch + 外部 listener 由来の dispatch が二重に流れても最終 state は idempotent", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const confirmed = makeTask({ filePath: "tasks/a.md", status: "Doing" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockResolvedValue(Result.ok(confirmed));

  await updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });
  // 外部 listener 由来の同等 dispatch
  harness.deps.dispatch({
    type: "task-updated",
    originalFilePath: "tasks/a.md",
    task: confirmed,
  });

  const finalTasks = (harness.state.current as { data: ProjectData }).data
    .tasks;
  expect(finalTasks[0].status).toBe("Doing");
});

// === エッジ: 連続変更 ===

test("ToDo → Doing → Done の連続 invoke が queue で順次処理される", async () => {
  const taskA = makeTask({ filePath: "tasks/a.md", status: "Todo" });
  const harness = setupLoaded(makeData([taskA]));
  updateTaskMock.mockImplementation(async (params) =>
    Result.ok({ ...taskA, status: params.status ?? taskA.status }),
  );

  const first = updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Doing",
  });
  const second = updateTaskAction(harness.deps, {
    filePath: "tasks/a.md",
    status: "Done",
  });
  await Promise.all([first, second]);

  const taskUpdates = harness.actions.filter((a) => a.type === "task-updated");
  // 1 回目 楽観 + 1 回目 確定 + 2 回目 楽観 + 2 回目 確定 = 4 件
  expect(taskUpdates).toHaveLength(4);
  expect((taskUpdates[0] as { task: Task }).task.status).toBe("Doing");
  expect((taskUpdates[1] as { task: Task }).task.status).toBe("Doing");
  expect((taskUpdates[2] as { task: Task }).task.status).toBe("Done");
  expect((taskUpdates[3] as { task: Task }).task.status).toBe("Done");
});
