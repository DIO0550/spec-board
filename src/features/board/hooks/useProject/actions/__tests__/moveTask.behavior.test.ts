import { beforeEach, expect, test, vi } from "vitest";
import {
  TauriError,
  updateCardOrder as updateCardOrderInvoke,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import {
  createProjectVersion,
  invalidateProject,
  type ProjectCommandQueue,
} from "../../concurrency";
import type { ProjectError } from "../../errors";
import type { ProjectAction, ProjectData, ProjectState } from "../../reducer";
import { reducer } from "../../reducer";
import { moveTaskAction } from "../moveTask";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    updateTask: vi.fn(),
    updateCardOrder: vi.fn(),
  };
});

const updateTaskMock = vi.mocked(updateTaskInvoke);
const updateCardOrderMock = vi.mocked(updateCardOrderInvoke);

/**
 * Task payload を最小限の overrides で生成するテストヘルパ。
 * @param overrides 上書きする TaskPayload フィールド
 * @returns ProjectData に格納可能な Task
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
 * filePath / status の組から ProjectData を生成するテストヘルパ。
 * @param pairs [filePath, status] のタプル配列
 * @returns Todo / Done カラムを持つ ProjectData
 */
const makeData = (
  pairs: ReadonlyArray<readonly [string, string]>,
): ProjectData => ({
  tasks: pairs.map(([filePath, status]) => makeTask({ filePath, status })),
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof moveTaskAction>[0];
};

/**
 * loaded 状態の moveTaskAction 実行に必要な harness を組み立てる。
 * @param data 初期 ProjectData
 * @returns moveTaskAction 呼び出しに必要な harness
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
      dispatchSync: (action) => {
        actions.push(action);
        state.current = reducer(state.current, action);
      },
    },
  };
};

beforeEach(() => {
  updateTaskMock.mockReset();
  updateCardOrderMock.mockReset();
});

test("fromColumn !== toColumn で updateTask が呼ばれる", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(updateTaskMock).toHaveBeenCalledWith({
    filePath: "tasks/a.md",
    status: "Done",
  });
});

test("カラム間移動: updateTask 成功後 updateCardOrder が呼ばれる", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
      ["tasks/c.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 1,
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(updateCardOrderMock).toHaveBeenCalledTimes(1);
  expect(updateCardOrderMock).toHaveBeenCalledWith({
    columnName: "Done",
    filePaths: ["tasks/b.md", "tasks/a.md", "tasks/c.md"],
  });
});

test("カラム間移動: 楽観 → 確定の順で task-updated x2 + card-order-updated x2 が dispatch される", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(harness.actions.map((a) => a.type)).toEqual([
    "task-updated",
    "card-order-updated",
    "task-updated",
    "card-order-updated",
  ]);
});

test("カラム間移動: 楽観 dispatch が IPC 完了前に getState() に反映される", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });

  let snapshotDuringIpc: ProjectData | null = null;
  updateTaskMock.mockImplementation(async () => {
    snapshotDuringIpc =
      (harness.state.current as { data?: ProjectData }).data ?? null;
    return Result.ok(movedA);
  });
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(snapshotDuringIpc).not.toBeNull();
  const inDone = (snapshotDuringIpc as unknown as ProjectData).tasks
    .filter((t) => t.status === "Done")
    .map((t) => t.filePath);
  expect(inDone).toEqual(["tasks/a.md", "tasks/b.md"]);
});

test("カラム間移動成功後、ProjectData.tasks に target が toIndex 位置で含まれる", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
      ["tasks/c.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 1,
  });

  const next = harness.state.current as { data: ProjectData };
  const inDone = next.data.tasks
    .filter((t) => t.status === "Done")
    .map((t) => t.filePath);
  expect(inDone).toEqual(["tasks/b.md", "tasks/a.md", "tasks/c.md"]);
});

test("同一カラム並び替え: 楽観 → 確定で card-order-updated が 2 回 dispatch される", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Todo"],
      ["tasks/c.md", "Todo"],
    ]),
  );
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Todo",
    toIndex: 2,
  });

  expect(result.ok).toBe(true);
  expect(updateTaskMock).not.toHaveBeenCalled();
  expect(updateCardOrderMock).toHaveBeenCalledWith({
    columnName: "Todo",
    filePaths: ["tasks/b.md", "tasks/a.md", "tasks/c.md"],
  });
  expect(harness.actions.map((a) => a.type)).toEqual([
    "card-order-updated",
    "card-order-updated",
  ]);
});

test("カラム内並び替え後の ProjectData.tasks 表示順が filePaths と一致", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Todo"],
      ["tasks/c.md", "Todo"],
    ]),
  );
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/c.md",
    fromColumn: "Todo",
    toColumn: "Todo",
    toIndex: 0,
  });

  const next = harness.state.current as { data: ProjectData };
  expect(next.data.tasks.map((t) => t.filePath)).toEqual([
    "tasks/c.md",
    "tasks/a.md",
    "tasks/b.md",
  ]);
});

test("並び順変化なし → IPC を呼ばず Result.ok / 楽観 dispatch も走らない", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Todo"],
    ]),
  );

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Todo",
    toIndex: 0,
  });

  expect(result.ok).toBe(true);
  expect(updateTaskMock).toHaveBeenCalledTimes(0);
  expect(updateCardOrderMock).toHaveBeenCalledTimes(0);
  expect(harness.actions).toEqual([]);
});

test("同一カラム並び替え: updateCardOrder 失敗 → 楽観 dispatch が rollback され state 原状", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Todo"],
      ["tasks/c.md", "Todo"],
    ]),
  );
  updateCardOrderMock.mockResolvedValue(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Todo",
    toIndex: 2,
  });

  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("tauri");
  expect(updateTaskMock).not.toHaveBeenCalled();
  expect(updateCardOrderMock).toHaveBeenCalledTimes(1);
  expect(harness.actions.map((a) => a.type)).toEqual([
    "card-order-updated",
    "card-order-updated",
  ]);
  const next = harness.state.current as { data: ProjectData };
  expect(
    next.data.tasks.filter((t) => t.status === "Todo").map((t) => t.filePath),
  ).toEqual(["tasks/a.md", "tasks/b.md", "tasks/c.md"]);
});

test("updateTask が Result.err なら ProjectError.tauri を返し updateCardOrder は呼ばれない / カラムは原状", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const err = new TauriError("UNKNOWN", "x");
  updateTaskMock.mockResolvedValue(Result.err(err));

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(updateTaskMock).toHaveBeenCalledWith({
    filePath: "tasks/a.md",
    status: "Done",
  });
  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("tauri");
  expect(updateCardOrderMock).not.toHaveBeenCalled();
  const next = harness.state.current as { data: ProjectData };
  const todoPaths = next.data.tasks
    .filter((t) => t.status === "Todo")
    .map((t) => t.filePath);
  const donePaths = next.data.tasks
    .filter((t) => t.status === "Done")
    .map((t) => t.filePath);
  expect(todoPaths).toEqual(["tasks/a.md"]);
  expect(donePaths).toEqual(["tasks/b.md"]);
});

test("カラム間移動: updateTask 失敗時の rollback dispatch 順序が固定される", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  updateTaskMock.mockResolvedValue(Result.err(new TauriError("UNKNOWN", "x")));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(harness.actions.map((a) => a.type)).toEqual([
    "task-updated",
    "card-order-updated",
    "card-order-updated",
    "task-updated",
    "card-order-updated",
  ]);
});

test("rollback 中に外部 listener が task-updated を dispatch していたら、snapshot で上書きせず外部更新を保護する", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  // IPC 待機中に外部 listener が task-updated を発火させた状況を再現する。
  // tasks/a.md は楽観 dispatch によって status=Done に切り替わった後、
  // 外部の file watcher 由来 listener が title を書き換えつつ status を
  // "InProgress" に更新したと仮定する。
  updateTaskMock.mockImplementation(async () => {
    harness.deps.dispatchSync({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: makeTask({
        filePath: "tasks/a.md",
        status: "InProgress",
        title: "外部更新後タイトル",
      }),
    });
    return Result.err(new TauriError("UNKNOWN", "x"));
  });

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  // 楽観 dispatch x2 + 外部 listener の task-updated x1 = 3 件が先行する。
  // rollback では snapshot による task 上書きが省略され、cardOrder の
  // rollback 2 件のみ流れる（全体で 5 件）。
  expect(harness.actions.map((a) => a.type)).toEqual([
    "task-updated",
    "card-order-updated",
    "task-updated",
    "card-order-updated",
    "card-order-updated",
  ]);
  const next = harness.state.current as { data: ProjectData };
  const target = next.data.tasks.find((t) => t.filePath === "tasks/a.md");
  expect(target?.title).toBe("外部更新後タイトル");
  expect(target?.status).toBe("InProgress");
});

test("rollback: status=toColumn のまま title 等が concurrent 更新された場合、rollback task は current のタイトルを保持し status のみ fromColumn に戻る", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  // 楽観 dispatch 後、IPC 待機中に外部 listener が title だけを書き換える
  // （status は optimistic と同じ Done のまま）。
  updateTaskMock.mockImplementation(async () => {
    harness.deps.dispatchSync({
      type: "task-updated",
      originalFilePath: "tasks/a.md",
      task: makeTask({
        filePath: "tasks/a.md",
        status: "Done",
        title: "外部更新後タイトル",
      }),
    });
    return Result.err(new TauriError("UNKNOWN", "x"));
  });

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  const next = harness.state.current as { data: ProjectData };
  const target = next.data.tasks.find((t) => t.filePath === "tasks/a.md");
  // status は fromColumn=Todo に戻る一方、title は外部更新の値を保持する。
  expect(target?.status).toBe("Todo");
  expect(target?.title).toBe("外部更新後タイトル");
});

test("カラム間移動: updateTask 失敗時に onRollback callback が呼ばれ、onOptimisticApplied は事前に 1 度呼ばれている", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  updateTaskMock.mockResolvedValue(Result.err(new TauriError("UNKNOWN", "x")));

  const optimistic = vi.fn();
  const rollback = vi.fn();
  await moveTaskAction(
    harness.deps,
    {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
    { onOptimisticApplied: optimistic, onRollback: rollback },
  );

  expect(optimistic).toHaveBeenCalledTimes(1);
  expect(optimistic).toHaveBeenCalledWith({
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
  });
  expect(rollback).toHaveBeenCalledTimes(1);
  expect(rollback).toHaveBeenCalledWith({
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
  });
});

test("カラム間で updateTask 成功 / updateCardOrder 失敗 → partial-move: status 確定保持 / cardOrder 補正 / onRollback は呼ばれない", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(
    Result.err(new TauriError("UNKNOWN", "x")),
  );

  const rollback = vi.fn();
  const result = await moveTaskAction(
    harness.deps,
    {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
    { onRollback: rollback },
  );

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("partial-move");
  expect(rollback).not.toHaveBeenCalled();

  const next = harness.state.current as { data: ProjectData };
  const target = next.data.tasks.find((t) => t.filePath === "tasks/a.md");
  expect(target?.status).toBe("Done");
  const donePaths = next.data.tasks
    .filter((t) => t.status === "Done")
    .map((t) => t.filePath);
  expect(donePaths).toEqual(["tasks/b.md", "tasks/a.md"]);
  const todoPaths = next.data.tasks
    .filter((t) => t.status === "Todo")
    .map((t) => t.filePath);
  expect(todoPaths).toEqual([]);
});

test("callbacks 未指定でも例外なく動作する（カラム間成功）", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(result.ok).toBe(true);
});

test("onOptimisticApplied が throw しても queue 進行は止まらず IPC が呼ばれる", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  const result = await moveTaskAction(
    harness.deps,
    {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
    {
      onOptimisticApplied: () => {
        throw new Error("boom");
      },
    },
  );

  expect(result.ok).toBe(true);
  expect(updateTaskMock).toHaveBeenCalledTimes(1);
});

test("同一カラム並び替えでは onOptimisticApplied / onRollback は呼ばれない", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Todo"],
      ["tasks/c.md", "Todo"],
    ]),
  );
  updateCardOrderMock.mockResolvedValue(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  const optimistic = vi.fn();
  const rollback = vi.fn();
  await moveTaskAction(
    harness.deps,
    {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Todo",
      toIndex: 2,
    },
    { onOptimisticApplied: optimistic, onRollback: rollback },
  );

  expect(optimistic).not.toHaveBeenCalled();
  expect(rollback).not.toHaveBeenCalled();
});

test("session が loaded でない時 invalidState で抜ける", async () => {
  const state = { current: { kind: "idle" } as ProjectState };
  const queue: ProjectCommandQueue = { current: Promise.resolve() };
  const version = createProjectVersion();
  const result = await moveTaskAction(
    {
      projectVersion: version,
      projectCommandQueue: queue,
      getState: () => state.current,
      dispatchSync: () => {},
    },
    {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
  );

  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("invalid-state");
  expect(updateTaskMock).not.toHaveBeenCalled();
});

test("IPC 中に projectVersion が変わると invalidState で抜け、rollback dispatch も走らない", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockImplementation(async () => {
    invalidateProject(harness.deps.projectVersion);
    return Result.ok(movedA);
  });

  const rollback = vi.fn();
  const result = await moveTaskAction(
    harness.deps,
    {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
    { onRollback: rollback },
  );

  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("invalid-state");
  expect(updateCardOrderMock).not.toHaveBeenCalled();
  expect(rollback).not.toHaveBeenCalled();
  expect(harness.actions.map((a) => a.type)).toEqual([
    "task-updated",
    "card-order-updated",
  ]);
});

test("楽観 dispatch + 外部 listen の二重 dispatch でも最終 state が同じ（idempotent）", async () => {
  const harness = setupLoaded(
    makeData([
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ]),
  );
  const movedA = makeTask({ filePath: "tasks/a.md", status: "Done" });
  updateTaskMock.mockResolvedValue(Result.ok(movedA));
  updateCardOrderMock.mockResolvedValue(Result.ok(undefined));

  await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });
  const beforeReplay = harness.state.current;

  harness.deps.dispatchSync({
    type: "task-updated",
    originalFilePath: "tasks/a.md",
    task: movedA,
  });
  harness.deps.dispatchSync({
    type: "card-order-updated",
    columnName: "Done",
    filePaths: ["tasks/a.md", "tasks/b.md"],
  });
  const afterReplay = harness.state.current;

  expect((afterReplay as { data: ProjectData }).data).toEqual(
    (beforeReplay as { data: ProjectData }).data,
  );
});

test.each([
  {
    name: "target task が存在しない",
    pairs: [
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ] as const,
    params: {
      taskFilePath: "tasks/missing.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
  },
  {
    name: "target.status と fromColumn が異なる",
    pairs: [
      ["tasks/a.md", "Done"],
      ["tasks/b.md", "Todo"],
    ] as const,
    params: {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    },
  },
  {
    name: "toColumn が columns に存在しない",
    pairs: [
      ["tasks/a.md", "Todo"],
      ["tasks/b.md", "Done"],
    ] as const,
    params: {
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Unknown",
      toIndex: 0,
    },
  },
])("queue 実行時に $name → invalidState", async ({ pairs, params }) => {
  const harness = setupLoaded(makeData(pairs));
  const result = await moveTaskAction(harness.deps, params);
  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("invalid-state");
  expect(harness.actions).toEqual([]);
});
