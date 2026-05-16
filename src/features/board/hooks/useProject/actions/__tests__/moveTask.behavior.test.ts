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

  expect(updateCardOrderMock).toHaveBeenCalledWith({
    columnName: "Done",
    filePaths: ["tasks/b.md", "tasks/a.md", "tasks/c.md"],
  });
});

test("カラム間移動: task-updated → card-order-updated の順で dispatch される", async () => {
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
  ]);
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

test("fromColumn === toColumn で並び順変化があれば updateCardOrder が呼ばれる", async () => {
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

test("並び順変化なし → IPC を呼ばず Result.ok", async () => {
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
});

test("updateTask が Result.err なら ProjectError.tauri を返し updateCardOrder は呼ばれない", async () => {
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

  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("tauri");
  expect(updateCardOrderMock).not.toHaveBeenCalled();
});

test("カラム間で updateTask 成功 / updateCardOrder 失敗 → task-updated は dispatch、card-order-updated は dispatch されず Result.err", async () => {
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

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("partial-move");
  expect(harness.actions.map((a) => a.type)).toEqual(["task-updated"]);
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

test("IPC 中に projectVersion が変わると invalidState で抜ける", async () => {
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

  const result = await moveTaskAction(harness.deps, {
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });

  expect(result.ok).toBe(false);
  expect((result as { error: ProjectError }).error.kind).toBe("invalid-state");
  expect(updateCardOrderMock).not.toHaveBeenCalled();
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
});
