import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import {
  type CreateTaskParams,
  createTask as createTaskInvoke,
  type DeleteTaskParams,
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  type UpdateTaskParams,
  updateColumns as updateColumnsInvoke,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { type UseProjectOptions, type UseProjectResult, useProject } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openDirectoryDialog: vi.fn(),
    openProject: vi.fn(),
    getColumns: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    updateColumns: vi.fn(),
  };
});

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const createTaskMock = vi.mocked(createTaskInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);
const deleteTaskMock = vi.mocked(deleteTaskInvoke);
const updateColumnsMock = vi.mocked(updateColumnsInvoke);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  // デフォルトでは get_columns を ok で返し、openProject 後の ProjectData が
  // 一貫した doneColumn を持つようにする。これで updateColumns 内の defensive
  // refetch が走らない (refetch 失敗時の safety abort もテストを破壊しない)。
  // 個別テストで失敗ケースを検証する場合は mockResolvedValueOnce で上書きする。
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: {
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    },
  });
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
  updateColumnsMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const Probe = (
  props: UseProjectOptions & {
    onResult: (r: UseProjectResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useProject(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const renderHook = (args: UseProjectOptions = {}) => {
  let latest: UseProjectResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        ...args,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return {
    get latest(): UseProjectResult {
      return latest as UseProjectResult;
    },
  };
};

const taskA: Task = {
  id: "a",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
};

const taskB: Task = {
  id: "b",
  title: "B",
  status: "Done",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/b.md",
};

const payload: OpenProjectPayload = {
  tasks: [taskA],
  columns: ["Todo", "Done"],
};

const openLoaded = async (probe: { latest: UseProjectResult }) => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
};

// === openProject フロー ===

test("openProject 成功 (idle → loaded)、get_columns 成功時はその columns / doneColumn を採用", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  expect(probe.latest.state).toEqual({
    kind: "loaded",
    path: "/p",
    data: {
      tasks: [taskA],
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    },
  });
});

test("openProject 成功時に get_columns が成功すれば doneColumn が ProjectData にセットされる", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  getColumnsMock.mockResolvedValueOnce(
    Result.ok({
      columns: [
        { name: "Todo", order: 0 },
        { name: "完了", order: 1 },
      ],
      doneColumn: "完了",
    }),
  );
  const probe = renderHook();
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
  const data = (
    probe.latest.state as {
      data: { doneColumn?: string; columns: { name: string }[] };
    }
  ).data;
  expect(data.doneColumn).toBe("完了");
  expect(data.columns.map((c) => c.name)).toEqual(["Todo", "完了"]);
});

test("openProject dialog cancel (null) → state 不変", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok(null));
  const onError = vi.fn();
  const probe = renderHook({ onError });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
  expect(openProjectMock).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

test("openProject dialog 例外 → state 不変、onError 発火", async () => {
  const dialogErr = new TauriError("UNKNOWN", "dialog boom");
  openDirectoryDialogMock.mockResolvedValueOnce(Result.err(dialogErr));
  const onError = vi.fn();
  const probe = renderHook({ onError });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
  expect(openProjectMock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith({ kind: "tauri", error: dialogErr });
});

test("openProject invoke 失敗 (idle 起点) → state error、onError 発火", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  const invokeErr = new TauriError("NOT_FOUND", "no");
  openProjectMock.mockResolvedValueOnce(Result.err(invokeErr));
  const onError = vi.fn();
  const probe = renderHook({ onError });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
  expect(probe.latest.state).toEqual({
    kind: "error",
    path: "/p",
    error: invokeErr,
  });
  expect(onError).toHaveBeenCalledWith({ kind: "tauri", error: invokeErr });
});

test("openProject invoke 失敗 (loaded 起点) → state は loaded のまま (Board 維持)、onError 発火", async () => {
  const onError = vi.fn();
  const probe = renderHook({ onError });
  await openLoaded(probe);
  expect(probe.latest.state.kind).toBe("loaded");

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  const invokeErr = new TauriError("NOT_FOUND", "no");
  openProjectMock.mockResolvedValueOnce(Result.err(invokeErr));

  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });

  expect(probe.latest.state.kind).toBe("loaded");
  expect((probe.latest.state as { path: string }).path).toBe("/p");
  expect(onError).toHaveBeenCalledWith({ kind: "tauri", error: invokeErr });
});

test("openProject 連打ガード: dialog pending 中の 2 回目呼び出しは無視される", async () => {
  let resolveDialog!: (r: ResultT<string | null, TauriError>) => void;
  openDirectoryDialogMock.mockReturnValueOnce(
    new Promise<ResultT<string | null, TauriError>>((res) => {
      resolveDialog = res;
    }),
  );
  const probe = renderHook();
  let pending1!: Promise<void>;
  let pending2!: Promise<void>;
  act(() => {
    pending1 = probe.latest.openProject();
    pending2 = probe.latest.openProject();
  });
  expect(openDirectoryDialogMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveDialog(Result.ok(null));
    await pending1;
    await pending2;
  });
});

test("openProject dialog 中 unmount → dispatch / onError 発火しない", async () => {
  let resolveDialog!: (r: ResultT<string | null, TauriError>) => void;
  openDirectoryDialogMock.mockReturnValueOnce(
    new Promise<ResultT<string | null, TauriError>>((res) => {
      resolveDialog = res;
    }),
  );
  const onError = vi.fn();
  const probe = renderHook({ onError });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  act(() => {
    root?.unmount();
    root = null;
  });
  await act(async () => {
    resolveDialog(Result.err(new TauriError("UNKNOWN", "x")));
    await pending;
  });
  expect(onError).not.toHaveBeenCalled();
  expect(openProjectMock).not.toHaveBeenCalled();
});

test("openProject invoke 中 unmount → dispatch / onError 発火しない", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  let resolveInvoke!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((res) => {
      resolveInvoke = res;
    }),
  );
  const onError = vi.fn();
  const probe = renderHook({ onError });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  // Wait for dialog to resolve so dispatch reaches loading
  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    root?.unmount();
    root = null;
  });
  await act(async () => {
    resolveInvoke(Result.err(new TauriError("UNKNOWN", "x")));
    await pending;
  });
  expect(onError).not.toHaveBeenCalled();
});

test("openProject 後勝ち: 2 回目の resolve が最終 state、1 回目 resolve は破棄", async () => {
  // 1 回目: dialog ok → invoke pending
  let resolveInvokeA!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/a"));
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((r) => {
      resolveInvokeA = r;
    }),
  );
  // 2 回目: dialog ok → invoke pending
  let resolveInvokeB!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/b"));
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((r) => {
      resolveInvokeB = r;
    }),
  );

  const probe = renderHook();
  let pending1!: Promise<void>;
  act(() => {
    pending1 = probe.latest.openProject();
  });
  // First open consumes dialog (pending), then waits invoke
  await act(async () => {
    await Promise.resolve();
  });
  // Second open: isDialogOpeningRef should now be false
  let pending2!: Promise<void>;
  act(() => {
    pending2 = probe.latest.openProject();
  });
  await act(async () => {
    await Promise.resolve();
  });

  const payloadB: OpenProjectPayload = { tasks: [taskB], columns: ["Done"] };
  await act(async () => {
    resolveInvokeB(Result.ok(payloadB));
    await pending2;
  });
  await act(async () => {
    resolveInvokeA(Result.ok(payload));
    await pending1;
  });

  // Final state should be the second open's payload
  expect(probe.latest.state.kind).toBe("loaded");
  expect((probe.latest.state as { path: string }).path).toBe("/b");
});

// === createTask ===

test("createTask (loaded) 成功 → Result.ok(task) + state.data.tasks 末尾追加", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const created: Task = { ...taskB };
  createTaskMock.mockResolvedValueOnce(Result.ok(created));
  let result!: Awaited<ReturnType<UseProjectResult["createTask"]>>;
  await act(async () => {
    result = await probe.latest.createTask({
      title: "B",
      status: "Done",
    } satisfies CreateTaskParams);
  });
  expect(result).toEqual({ ok: true, value: created });
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([taskA, created]);
});

test("createTask (loaded) 失敗 → Result.err(tauri)、state 不変", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const err = new TauriError("IO_ERROR", "io");
  createTaskMock.mockResolvedValueOnce(Result.err(err));
  let result!: Awaited<ReturnType<UseProjectResult["createTask"]>>;
  await act(async () => {
    result = await probe.latest.createTask({ title: "x", status: "Todo" });
  });
  expect(result).toEqual({ ok: false, error: { kind: "tauri", error: err } });
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([taskA]);
});

test("createTask (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<UseProjectResult["createTask"]>>;
  await act(async () => {
    result = await probe.latest.createTask({ title: "x", status: "Todo" });
  });
  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(createTaskMock).not.toHaveBeenCalled();
});

// === updateTask ===

test("updateTask (loaded) 成功 → Result.ok(task) + 該当差し替え", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const updated: Task = { ...taskA, title: "renamed" };
  updateTaskMock.mockResolvedValueOnce(Result.ok(updated));
  let result!: Awaited<ReturnType<UseProjectResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({
      filePath: "tasks/a.md",
      title: "renamed",
    } satisfies UpdateTaskParams);
  });
  expect(result).toEqual({ ok: true, value: updated });
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks[0].title,
  ).toBe("renamed");
});

test("updateTask (loaded) 失敗 → Result.err、state 不変", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const err = new TauriError("IO_ERROR", "io");
  updateTaskMock.mockResolvedValueOnce(Result.err(err));
  let result!: Awaited<ReturnType<UseProjectResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({ filePath: "tasks/a.md" });
  });
  expect(result.ok).toBe(false);
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([taskA]);
});

test("updateTask (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<UseProjectResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({ filePath: "tasks/x.md" });
  });
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(updateTaskMock).not.toHaveBeenCalled();
});

// === deleteTask ===

test("deleteTask (loaded) 成功 → Result.ok + 除去", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));
  let result!: Awaited<ReturnType<UseProjectResult["deleteTask"]>>;
  await act(async () => {
    result = await probe.latest.deleteTask({
      filePath: "tasks/a.md",
    } satisfies DeleteTaskParams);
  });
  expect(result).toEqual({ ok: true, value: undefined });
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([]);
});

test("deleteTask (loaded) 失敗 → Result.err、state 不変", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const err = new TauriError("IO_ERROR", "io");
  deleteTaskMock.mockResolvedValueOnce(Result.err(err));
  let result!: Awaited<ReturnType<UseProjectResult["deleteTask"]>>;
  await act(async () => {
    result = await probe.latest.deleteTask({ filePath: "tasks/a.md" });
  });
  expect(result.ok).toBe(false);
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([taskA]);
});

test("deleteTask (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<UseProjectResult["deleteTask"]>>;
  await act(async () => {
    result = await probe.latest.deleteTask({ filePath: "tasks/x.md" });
  });
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(deleteTaskMock).not.toHaveBeenCalled();
});

// === updateColumns ===

test("updateColumns (loaded) 成功 → Result.ok + columns 置き換え + tasks status 書き換え", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  updateColumnsMock.mockResolvedValueOnce(Result.ok(undefined));
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns({
      columns: [
        { name: "Backlog", order: 0 },
        { name: "Done", order: 1 },
      ],
      renames: [{ from: "Todo", to: "Backlog" }],
    });
  });
  expect(result).toEqual({ ok: true, value: { applied: true } });
  const data = (
    probe.latest.state as {
      data: { tasks: Task[]; columns: { name: string }[] };
    }
  ).data;
  expect(data.columns.map((c) => c.name)).toEqual(["Backlog", "Done"]);
  expect(data.tasks[0].status).toBe("Backlog");
});

test("updateColumns 直列化: 同時 2 回呼び出しで 2 回目は 1 回目の完了を待つ", async () => {
  const probe = renderHook();
  await openLoaded(probe);

  const callOrder: string[] = [];
  let resolve1!: (r: ResultT<void, TauriError>) => void;
  let resolve2!: (r: ResultT<void, TauriError>) => void;
  updateColumnsMock.mockImplementationOnce(() => {
    callOrder.push("call-1");
    return new Promise<ResultT<void, TauriError>>((r) => {
      resolve1 = r;
    });
  });
  updateColumnsMock.mockImplementationOnce(() => {
    callOrder.push("call-2");
    return new Promise<ResultT<void, TauriError>>((r) => {
      resolve2 = r;
    });
  });

  let p1!: Promise<unknown>;
  let p2!: Promise<unknown>;
  act(() => {
    // doneColumn 削除を伴うので新 doneColumn を明示
    p1 = probe.latest.updateColumns({
      columns: [{ name: "A", order: 0 }],
      doneColumn: "A",
    });
    p2 = probe.latest.updateColumns({
      columns: [{ name: "B", order: 0 }],
      doneColumn: "B",
    });
  });

  // queue でシリアライズされるので、まだ 1 回目のみ呼ばれている
  await act(async () => {
    await Promise.resolve();
  });
  expect(callOrder).toEqual(["call-1"]);

  await act(async () => {
    resolve1(Result.ok(undefined));
    await p1;
  });

  // 1 回目完了で 2 回目が走り出す
  expect(callOrder).toEqual(["call-1", "call-2"]);

  await act(async () => {
    resolve2(Result.ok(undefined));
    await p2;
  });
});

test("updateColumns 1 回目失敗後も queue が詰まらず 2 回目が実行される", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const err = new TauriError("IO_ERROR", "io");
  updateColumnsMock.mockResolvedValueOnce(Result.err(err));
  updateColumnsMock.mockResolvedValueOnce(Result.ok(undefined));
  let p1!: Promise<unknown>;
  let p2!: Promise<unknown>;
  act(() => {
    p1 = probe.latest.updateColumns({
      columns: [{ name: "A", order: 0 }],
      doneColumn: "A",
    });
    p2 = probe.latest.updateColumns({
      columns: [{ name: "B", order: 0 }],
      doneColumn: "B",
    });
  });
  await act(async () => {
    await p1;
    await p2;
  });
  expect(updateColumnsMock).toHaveBeenCalledTimes(2);
});

test("updateColumns (loaded) 失敗 → Result.err、state 不変", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const err = new TauriError("IO_ERROR", "io");
  updateColumnsMock.mockResolvedValueOnce(Result.err(err));
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns({
      columns: [{ name: "X", order: 0 }],
    });
  });
  expect(result.ok).toBe(false);
  const data = (probe.latest.state as { data: { columns: { name: string }[] } })
    .data;
  expect(data.columns.map((c) => c.name)).toEqual(["Todo", "Done"]);
});

test("updateColumns (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns({
      columns: [{ name: "A", order: 0 }],
    });
  });
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

// === 世代検証 (codex review #1 対応) ===

test("createTask invoke pending 中に reset → resolve 時に dispatch されず invalid-state を返す", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  let resolveCreate!: (r: ResultT<Task, TauriError>) => void;
  createTaskMock.mockReturnValueOnce(
    new Promise<ResultT<Task, TauriError>>((r) => {
      resolveCreate = r;
    }),
  );
  let pending!: Promise<ResultT<Task, never>>;
  act(() => {
    pending = probe.latest.createTask({
      title: "X",
      status: "Todo",
    }) as Promise<ResultT<Task, never>>;
  });
  // pending 中に reset でプロジェクトを抜ける
  act(() => {
    probe.latest.reset();
  });
  let result!: Awaited<ReturnType<UseProjectResult["createTask"]>>;
  await act(async () => {
    resolveCreate(Result.ok({ ...taskB }));
    result = await pending;
  });
  expect(probe.latest.state.kind).toBe("idle");
  expect(result.ok).toBe(false);
});

test("updateColumns updater 形式: queue 実行時の最新 state から params を計算する", async () => {
  const probe = renderHook();
  await openLoaded(probe);

  const calls: { columns: string[] }[] = [];
  updateColumnsMock.mockImplementation(async (p) => {
    calls.push({ columns: (p.columns ?? []).map((c) => c.name) });
    return Result.ok(undefined);
  });

  let p1!: Promise<unknown>;
  let p2!: Promise<unknown>;
  act(() => {
    p1 = probe.latest.updateColumns((current) => ({
      columns: [
        ...current.columns,
        { name: "A", order: current.columns.length },
      ],
    }));
    p2 = probe.latest.updateColumns((current) => ({
      columns: [
        ...current.columns,
        { name: "B", order: current.columns.length },
      ],
    }));
  });
  await act(async () => {
    await p1;
    await p2;
  });
  // 1 回目: 元の Todo, Done に A 追加
  // 2 回目: queue 実行時の最新 (Todo, Done, A) に B 追加
  expect(calls[0].columns).toEqual(["Todo", "Done", "A"]);
  expect(calls[1].columns).toEqual(["Todo", "Done", "A", "B"]);
});

test("openProject: get_columns 失敗時は openProject 全体を失敗扱い (doneColumn 不整合防止)", async () => {
  // open_project 自体は成功するが get_columns が失敗するケース
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  const refetchErr = new TauriError("UNKNOWN", "get_columns fail");
  getColumnsMock.mockResolvedValueOnce(Result.err(refetchErr));

  const onError = vi.fn();
  const probe = renderHook({ onError });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });

  // state は error / idle に遷移し、loaded には進まない
  expect(probe.latest.state.kind).not.toBe("loaded");
  // onError が発火する
  expect(onError).toHaveBeenCalledWith({ kind: "tauri", error: refetchErr });
});

test("updateColumns: doneColumn 削除を伴うのに params.doneColumn 未指定なら hook が拒否 (config 破壊防止)", async () => {
  const probe = renderHook();
  await openLoaded(probe); // doneColumn = "Done"
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    // Done を削除する操作なのに params.doneColumn を渡さない
    result = await probe.latest.updateColumns({
      columns: [{ name: "Todo", order: 0 }],
    });
  });
  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("updateColumns: 明示的 params.doneColumn が params.columns に存在しないと hook が拒否 (config 破壊防止)", async () => {
  const probe = renderHook();
  await openLoaded(probe); // doneColumn = "Done"
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    // doneColumn を "Stale" に指定するが Stale は columns に存在しない (typo / stale)
    result = await probe.latest.updateColumns({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Stale",
    });
  });
  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("updateColumns updater が throw した場合 Promise reject せず Result.err を返す", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns(() => {
      throw new Error("updater boom");
    });
  });
  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe("tauri");
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("updateColumns updater が null を返した場合 invoke せず Result.ok({ applied: false }) を返す", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  let result!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns(() => null);
  });
  expect(result).toEqual({ ok: true, value: { applied: false } });
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("updateColumns: 1 回目 pending 中に enqueue した 2 回目は再 open 後に invoke されない", async () => {
  const probe = renderHook();
  await openLoaded(probe);

  let resolve1!: (r: ResultT<void, TauriError>) => void;
  updateColumnsMock.mockImplementationOnce(
    () =>
      new Promise<ResultT<void, TauriError>>((r) => {
        resolve1 = r;
      }),
  );
  // 2 回目以降は記録だけする（enqueue 後の generation 不一致で呼ばれない想定）
  updateColumnsMock.mockResolvedValue(Result.ok(undefined));

  let p1!: Promise<unknown>;
  let p2!: Promise<unknown>;
  act(() => {
    p1 = probe.latest.updateColumns({
      columns: [{ name: "A", order: 0 }],
      doneColumn: "A",
    });
    p2 = probe.latest.updateColumns({
      columns: [{ name: "B", order: 0 }],
      doneColumn: "B",
    });
  });

  // 同じ path を再 open（generation を進める）
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    await probe.latest.openProject();
  });

  // 1 回目を resolve（旧 generation）
  await act(async () => {
    resolve1(Result.ok(undefined));
    await p1;
  });
  // 2 回目は queue 実行時に generation 不一致で invoke されず invalid-state
  let result2!: Awaited<ReturnType<UseProjectResult["updateColumns"]>>;
  await act(async () => {
    result2 = (await p2) as Awaited<
      ReturnType<UseProjectResult["updateColumns"]>
    >;
  });
  expect(result2.ok).toBe(false);
  expect((result2 as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
  // mock 呼び出し回数は 1 回目のみ（再 open の openProject は別 mock）
  expect(updateColumnsMock).toHaveBeenCalledTimes(1);
});

test("createTask pending 中に同じ path を再 open → resolve 時は invalid-state（generation 不一致）", async () => {
  const onError = vi.fn();
  const probe = renderHook({ onError });
  await openLoaded(probe);

  let resolveCreate!: (r: ResultT<Task, TauriError>) => void;
  createTaskMock.mockReturnValueOnce(
    new Promise<ResultT<Task, TauriError>>((r) => {
      resolveCreate = r;
    }),
  );
  let pending!: Promise<Awaited<ReturnType<UseProjectResult["createTask"]>>>;
  act(() => {
    pending = probe.latest.createTask({ title: "x", status: "Todo" });
  });

  // 同じ path で再 open（dialog→invoke 成功）して generation を進める
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    await probe.latest.openProject();
  });

  // create resolve → 古い世代なので state には反映されず invalid-state を返す
  let result!: Awaited<ReturnType<UseProjectResult["createTask"]>>;
  await act(async () => {
    resolveCreate(Result.ok({ ...taskB }));
    result = await pending;
  });
  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe(
    "invalid-state",
  );
});
