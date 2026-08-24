import {
  listen as listenInvoke,
  type UnlistenFn as UnlistenFnT,
} from "@tauri-apps/api/event";
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
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
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
import { Task, type TaskPayload } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import {
  type ProjectData,
  type ProjectError,
  ProjectProvider,
  type ProjectState,
  useProjectColumnActions,
  useProjectEvents,
  useProjectSessionActions,
  useProjectState,
  useProjectTaskActions,
} from "..";
import type {
  ProjectColumnActionsContextValue,
  ProjectSessionActionsContextValue,
  ProjectTaskActionsContextValue,
} from "../context";
import { bridgeProjectEvent } from "./probeEventBridge";
import {
  resetWatcherEnvelopeCounters,
  watcherEnvelope,
} from "./watcherEnvelopeHarness";

/** 旧 useProject option 相当。onLoaded / onError は project events から橋渡しする。 */
type ProbeOptions = {
  onError?: (error: ProjectError) => void;
  onLoaded?: (event: { path: string; data: ProjectData }) => void;
};

/** 旧 ProbeResult 相当。state + 3 系統 action を 1 オブジェクトに合成する。 */
type ProbeResult = { state: ProjectState } & ProjectSessionActionsContextValue &
  ProjectTaskActionsContextValue &
  ProjectColumnActionsContextValue;

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

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const createTaskMock = vi.mocked(createTaskInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);
const deleteTaskMock = vi.mocked(deleteTaskInvoke);
const updateColumnsMock = vi.mocked(updateColumnsInvoke);
const listenMock = vi.mocked(listenInvoke);

type ListenHandler<P = { task: TaskPayload }> = (event: { payload: P }) => void;

type CaptureListenResult<P> = {
  handlers: ListenHandler<P>[];
  unlistenFns: ReturnType<typeof vi.fn>[];
};

type CaptureMultiResult<P> = {
  handlersByEvent: Record<string, ListenHandler<P>[]>;
  unlistenByEvent: Record<string, ReturnType<typeof vi.fn>[]>;
};

const installCaptureListen = <P,>(
  eventNames: readonly string[],
): CaptureMultiResult<P> => {
  const handlersByEvent: Record<string, ListenHandler<P>[]> = {};
  const unlistenByEvent: Record<string, ReturnType<typeof vi.fn>[]> = {};
  for (const name of eventNames) {
    handlersByEvent[name] = [];
    unlistenByEvent[name] = [];
  }
  listenMock.mockImplementation(((name, handler) => {
    const unlisten = vi.fn();
    const handlerBucket = handlersByEvent[name] ?? [];
    handlersByEvent[name] = handlerBucket;
    // 既存テストは payload を raw のまま投げるため、envelope 化はここで吸収する。
    // 各テストの呼び出し形（handlers[0]({ payload })）を変えずに新契約へ載せ替える。
    const enveloping: ListenHandler<P> = (event) => {
      (handler as unknown as ListenHandler<unknown>)({
        payload: watcherEnvelope(event.payload),
      });
    };
    handlerBucket.push(enveloping);
    const unlistenBucket = unlistenByEvent[name] ?? [];
    unlistenByEvent[name] = unlistenBucket;
    unlistenBucket.push(unlisten);
    return Promise.resolve(unlisten);
  }) as typeof listenInvoke);
  return { handlersByEvent, unlistenByEvent };
};

const captureListen = <P = { task: TaskPayload }>(
  eventName: string,
): CaptureListenResult<P> => {
  const { handlersByEvent, unlistenByEvent } = installCaptureListen<P>([
    eventName,
  ]);
  return {
    handlers: handlersByEvent[eventName],
    unlistenFns: unlistenByEvent[eventName],
  };
};

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
  listenMock.mockReset();
  listenMock.mockResolvedValue(vi.fn());
  resetWatcherEnvelopeCounters();
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
  props: ProbeOptions & {
    onResult: (r: ProbeResult) => void;
  },
) => {
  const { onResult, onError, onLoaded } = props;
  const { state } = useProjectState();
  const session = useProjectSessionActions();
  const taskActions = useProjectTaskActions();
  const columnActions = useProjectColumnActions();
  const { subscribe } = useProjectEvents();
  // 旧 onLoaded / onError props をドメインイベント購読へ橋渡しする。
  useEffect(() => {
    return subscribe((event) => {
      bridgeProjectEvent(event, onLoaded, onError);
    });
  }, [subscribe, onLoaded, onError]);
  const result: ProbeResult = {
    state,
    ...session,
    ...taskActions,
    ...columnActions,
  };
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const renderHook = (args: ProbeOptions = {}) => {
  let latest: ProbeResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        ProjectProvider,
        null,
        createElement(Probe, {
          ...args,
          onResult: (r) => {
            latest = r;
          },
        }),
      ),
    );
  });
  return {
    get latest(): ProbeResult {
      return latest as ProbeResult;
    },
  };
};

const taskA: Task = Task.fromPayload({
  id: "a",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/a.md"),
});

const taskB: Task = Task.fromPayload({
  id: "b",
  title: "B",
  status: "Done",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/b.md"),
});

const payload: OpenProjectPayload = {
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks: [taskA],
  columns: ["Todo", "Done"],
  projections: new Map(),
  milestoneProjections: new Map([
    [
      "release-1",
      { done: 0, total: 1, taskFilePaths: [taskFilePathFixture("tasks/a.md")] },
    ],
  ]),
  taskTree: [],
};

const openLoaded = async (probe: { latest: ProbeResult }) => {
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

test("listener readiness完了前はopen_projectを開始しない", async () => {
  const pendingRegistrations: Array<{
    readonly resolve: (unlisten: UnlistenFnT) => void;
  }> = [];
  listenMock.mockImplementation(
    () =>
      new Promise<UnlistenFnT>((resolve) => {
        pendingRegistrations.push({ resolve });
      }),
  );
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  const probe = renderHook();
  let pending!: Promise<void>;

  act(() => {
    pending = probe.latest.openProjectByPath("/p");
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(listenMock).toHaveBeenCalledTimes(5);
  expect(openProjectMock).not.toHaveBeenCalled();
  expect(probe.latest.state).toEqual({ kind: "idle" });

  await act(async () => {
    pendingRegistrations.forEach((registration) => {
      registration.resolve(vi.fn());
    });
    await pending;
  });

  expect(openProjectMock).toHaveBeenCalledWith({ path: "/p" });
  expect(probe.latest.state.kind).toBe("loaded");
});

test("listener登録失敗ではopenせず、次のopenで登録を再試行できる", async () => {
  const registrationError = new Error("listen failed");
  const successfulUnlistens = Array.from({ length: 4 }, () => vi.fn());
  listenMock
    .mockRejectedValueOnce(registrationError)
    .mockResolvedValueOnce(successfulUnlistens[0] as UnlistenFnT)
    .mockResolvedValueOnce(successfulUnlistens[1] as UnlistenFnT)
    .mockResolvedValueOnce(successfulUnlistens[2] as UnlistenFnT)
    .mockResolvedValueOnce(successfulUnlistens[3] as UnlistenFnT);
  const onError = vi.fn();
  const probe = renderHook({ onError });
  let failedOpen!: Promise<void>;

  act(() => {
    failedOpen = probe.latest.openProjectByPath("/p");
  });
  await act(async () => {
    await failedOpen;
  });

  expect(probe.latest.state).toEqual({ kind: "idle" });
  expect(openProjectMock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith({
    kind: "invalid-state",
    reason: "operation-rejected",
    message:
      "ファイル監視の準備に失敗しました。プロジェクトをもう一度開いてください",
  });
  successfulUnlistens.forEach((unlisten) => {
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  listenMock.mockResolvedValue(vi.fn());
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  let retryOpen!: Promise<void>;
  act(() => {
    retryOpen = probe.latest.openProjectByPath("/p");
  });
  await act(async () => {
    await retryOpen;
  });

  expect(listenMock).toHaveBeenCalledTimes(10);
  expect(openProjectMock).toHaveBeenCalledTimes(1);
  expect(probe.latest.state.kind).toBe("loaded");
});

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
      projections: new Map(),
      loadWarnings: payload.loadWarnings,
      milestoneProjections: payload.milestoneProjections,
      taskTree: [],
      openRequestId: 1,
      watcherSession: WATCHER_SESSION_FIXTURE,
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

test("openProjectByPath の resolve 中に unmount されたら open_project を呼ばない", async () => {
  openProjectMock.mockResolvedValue(Result.ok(payload));
  const onLoaded = vi.fn();
  const probe = renderHook({ onLoaded });
  const openByPath = probe.latest.openProjectByPath;
  let pending!: Promise<void>;
  // openProjectByPath 呼び出し直後（resolve 継続の microtask 前）に同期 unmount する。
  // cleanup が invalidateProject で project 世代を進めるため、continuation は
  // projectSnapshot 不一致で open-start に進まず open_project を呼ばない。
  act(() => {
    pending = openByPath("/p");
    root?.unmount();
    root = null;
  });
  await act(async () => {
    await pending;
  });
  expect(openProjectMock).not.toHaveBeenCalled();
  expect(onLoaded).not.toHaveBeenCalled();
});

test("openProject 成功 → onLoaded が path / data 付きで 1 回だけ発火する", async () => {
  const onLoaded = vi.fn();
  const probe = renderHook({ onLoaded });
  await openLoaded(probe);
  expect(onLoaded).toHaveBeenCalledTimes(1);
  expect(onLoaded).toHaveBeenCalledWith({
    path: "/p",
    data: {
      tasks: [taskA],
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
      projections: new Map(),
      loadWarnings: payload.loadWarnings,
      milestoneProjections: payload.milestoneProjections,
      taskTree: [],
      openRequestId: 1,
      watcherSession: WATCHER_SESSION_FIXTURE,
    },
  });
});

test("openProject invoke 失敗 → onLoaded は発火しない", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.err(new TauriError("NOT_FOUND", "no")),
  );
  const onLoaded = vi.fn();
  const probe = renderHook({ onLoaded });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
  expect(onLoaded).not.toHaveBeenCalled();
});

test("openProject invoke 中 unmount → onLoaded は発火しない", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  let resolveInvoke!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((res) => {
      resolveInvoke = res;
    }),
  );
  const onLoaded = vi.fn();
  const probe = renderHook({ onLoaded });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    root?.unmount();
    root = null;
  });
  await act(async () => {
    resolveInvoke(Result.ok(payload));
    await pending;
  });
  expect(onLoaded).not.toHaveBeenCalled();
});

test("openProjectByPath 成功 → onLoaded が path / data 付きで発火する", async () => {
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  const onLoaded = vi.fn();
  const probe = renderHook({ onLoaded });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProjectByPath("/p");
  });
  await act(async () => {
    await pending;
  });
  expect(onLoaded).toHaveBeenCalledTimes(1);
  expect(onLoaded).toHaveBeenCalledWith({
    path: "/p",
    data: {
      tasks: [taskA],
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
      projections: new Map(),
      loadWarnings: payload.loadWarnings,
      milestoneProjections: payload.milestoneProjections,
      taskTree: [],
      openRequestId: 1,
      watcherSession: WATCHER_SESSION_FIXTURE,
    },
  });
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

test("openProject invoke 失敗 (loaded 起点) → 直前の loaded に復元、onError 発火", async () => {
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

test("openProject 後勝ち: 1 回目の invoke pending 中に 2 回目が来ると最終 state は B", async () => {
  // 1 回目: dialog ok → invoke は手動 promise で pending 保持
  let resolveInvokeA!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/a"));
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((r) => {
      resolveInvokeA = r;
    }),
  );
  // 2 回目: dialog ok → invoke は即 resolve
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/b"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [taskB],
      columns: ["Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
    }),
  );
  getColumnsMock.mockResolvedValueOnce(
    Result.ok({
      columns: [{ name: "Done", order: 0 }],
      doneColumn: "Done",
    }),
  );

  const probe = renderHook();
  let pending1!: Promise<void>;
  act(() => {
    pending1 = probe.latest.openProject();
  });
  // 1 回目の invoke が pending になるまで microtask 進める
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  // 2 回目の openProject (requestId が 2 に進む)
  let pending2!: Promise<void>;
  act(() => {
    pending2 = probe.latest.openProject();
  });
  // 1 回目の invoke を resolve させて queue を進める
  await act(async () => {
    resolveInvokeA(
      Result.ok({
        loadWarnings: [],
        session: WATCHER_SESSION_FIXTURE,
        tasks: [],
        columns: [],
        projections: new Map(),
        milestoneProjections: new Map(),
        taskTree: [],
      }),
    );
    await pending1;
    await pending2;
  });

  // 最終 state は 2 回目 (B) の payload
  expect(probe.latest.state.kind).toBe("loaded");
  expect((probe.latest.state as { path: string }).path).toBe("/b");
  // 1 回目の invoke は呼ばれた (queue 内で post-invoke の requestId mismatch
  // で dispatch 抑止される)、2 回目も invoke される
  expect(openProjectMock).toHaveBeenCalledWith({ path: "/b" });
});

// === createTask ===

test("createTask (loaded) 成功 → Result.ok(task) + state.data.tasks 末尾追加", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const created: Task = { ...taskB };
  createTaskMock.mockResolvedValueOnce(Result.ok(created));
  let result!: Awaited<ReturnType<ProbeResult["createTask"]>>;
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
  let result!: Awaited<ReturnType<ProbeResult["createTask"]>>;
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
  let result!: Awaited<ReturnType<ProbeResult["createTask"]>>;
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
  let result!: Awaited<ReturnType<ProbeResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({
      filePath: taskFilePathFixture("tasks/a.md"),
      title: "renamed",
    } satisfies UpdateTaskParams);
  });
  expect(result).toEqual({ ok: true, value: updated });
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks[0].title,
  ).toBe("renamed");
});

test("updateTask (loaded) 失敗 → Result.err、楽観 → rollback で state が snapshot に戻る", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  const err = new TauriError("IO_ERROR", "io");
  updateTaskMock.mockResolvedValueOnce(Result.err(err));
  let result!: Awaited<ReturnType<ProbeResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({
      filePath: taskFilePathFixture("tasks/a.md"),
      status: "Doing",
    });
  });
  expect(result.ok).toBe(false);
  // 楽観反映後に rollback されて元の taskA に戻る
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([taskA]);
});

test("updateTask 楽観対象キーなし ({ filePath, parent } のみ) → 楽観 dispatch skip、IPC 成功時に BE 値で確定 dispatch", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  // BE が parent 付与済み task を返す想定
  const updated: Task = {
    ...taskA,
    hierarchy: {
      ...taskA.hierarchy,
      parentFilePath: taskFilePathFixture("tasks/parent.md"),
    },
  };
  let stateDuringIpc: Task | null = null;
  updateTaskMock.mockImplementationOnce(async () => {
    // IPC await 中の state スナップショット: 楽観 dispatch が skip されているので
    // hierarchy.parentFilePath はまだ更新されていない（taskA のまま）
    const data = (probe.latest.state as { data: { tasks: Task[] } }).data;
    stateDuringIpc = data.tasks[0];
    return Result.ok(updated);
  });
  let result!: Awaited<ReturnType<ProbeResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({
      filePath: taskFilePathFixture("tasks/a.md"),
      parent: taskFilePathFixture("tasks/parent.md"),
    });
  });
  expect(result).toEqual({ ok: true, value: updated });
  // IPC 中の state は楽観反映されていない（parent は元のまま）
  expect(
    (stateDuringIpc as Task | null)?.hierarchy.parentFilePath,
  ).toBeUndefined();
  // 確定 dispatch で BE 値が反映される
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks[0].hierarchy
      .parentFilePath,
  ).toBe(taskFilePathFixture("tasks/parent.md"));
});

test("updateTask (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<ProbeResult["updateTask"]>>;
  await act(async () => {
    result = await probe.latest.updateTask({
      filePath: taskFilePathFixture("tasks/x.md"),
    });
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
  let result!: Awaited<ReturnType<ProbeResult["deleteTask"]>>;
  await act(async () => {
    result = await probe.latest.deleteTask({
      filePath: taskFilePathFixture("tasks/a.md"),
    } satisfies DeleteTaskParams);
  });
  expect(result).toEqual({ ok: true, value: undefined });
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([]);
});

test("deleteTask (loaded) pending 中は tasks 空 → 失敗 resolve で snapshot 復元", async () => {
  const probe = renderHook();
  await openLoaded(probe);

  let resolveInvoke!: (r: ResultT<void, TauriError>) => void;
  deleteTaskMock.mockReturnValueOnce(
    new Promise<ResultT<void, TauriError>>((r) => {
      resolveInvoke = r;
    }),
  );

  let resultPromise!: Promise<Awaited<ReturnType<ProbeResult["deleteTask"]>>>;
  act(() => {
    resultPromise = probe.latest.deleteTask({
      filePath: taskFilePathFixture("tasks/a.md"),
    });
  });
  // queue の microtask を進めて楽観 dispatch を反映させる
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // 楽観反映: invoke 未完了でも tasks から target が消えている
  expect(
    (probe.latest.state as { data: { tasks: Task[] } }).data.tasks,
  ).toEqual([]);

  // 失敗 resolve → state-replaced rollback で snapshot が完全復元される
  const err = new TauriError("IO_ERROR", "io");
  let result!: Awaited<ReturnType<ProbeResult["deleteTask"]>>;
  await act(async () => {
    resolveInvoke(Result.err(err));
    result = await resultPromise;
  });

  expect(result.ok).toBe(false);
  const restored = (probe.latest.state as { data: { tasks: Task[] } }).data
    .tasks;
  expect(restored).toHaveLength(1);
  expect(restored[0].filePath).toBe(taskA.filePath);
  expect(restored[0].title).toBe(taskA.title);
});

test("deleteTask orphanStrategy: 'clear' を invoke にそのまま forwarding", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));
  await act(async () => {
    await probe.latest.deleteTask({
      filePath: taskFilePathFixture("tasks/a.md"),
      orphanStrategy: "clear",
    } satisfies DeleteTaskParams);
  });
  expect(deleteTaskMock).toHaveBeenCalledWith({
    filePath: taskFilePathFixture("tasks/a.md"),
    orphanStrategy: "clear",
  });
});

test("deleteTask orphanStrategy: 'abort' を invoke にそのまま forwarding", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));
  await act(async () => {
    await probe.latest.deleteTask({
      filePath: taskFilePathFixture("tasks/a.md"),
      orphanStrategy: "abort",
    } satisfies DeleteTaskParams);
  });
  expect(deleteTaskMock).toHaveBeenCalledWith({
    filePath: taskFilePathFixture("tasks/a.md"),
    orphanStrategy: "abort",
  });
});

test("deleteTask orphanStrategy 未指定なら invoke にも未指定で forwarding", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));
  await act(async () => {
    await probe.latest.deleteTask({
      filePath: taskFilePathFixture("tasks/a.md"),
    } satisfies DeleteTaskParams);
  });
  expect(deleteTaskMock).toHaveBeenCalledWith({
    filePath: taskFilePathFixture("tasks/a.md"),
  });
});

test("deleteTask (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<ProbeResult["deleteTask"]>>;
  await act(async () => {
    result = await probe.latest.deleteTask({
      filePath: taskFilePathFixture("tasks/x.md"),
    });
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
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
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
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
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
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
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
  let result!: Awaited<ReturnType<ProbeResult["createTask"]>>;
  await act(async () => {
    resolveCreate(Result.ok({ ...taskB }));
    result = await pending;
  });
  expect(probe.latest.state.kind).toBe("idle");
  expect(result.ok).toBe(false);
  expect(result).toMatchObject({
    ok: false,
    error: { kind: "invalid-state", reason: "project-switched" },
  });
});

test("updateColumns invoke pending中のproject切替はcommitせずproject-switchedを返す", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  let resolveUpdate!: (result: ResultT<void, TauriError>) => void;
  updateColumnsMock.mockReturnValueOnce(
    new Promise<ResultT<void, TauriError>>((resolve) => {
      resolveUpdate = resolve;
    }),
  );
  let pending!: ReturnType<ProbeResult["updateColumns"]>;
  act(() => {
    pending = probe.latest.updateColumns({
      columns: [{ name: "Next", order: 0 }],
    });
  });
  act(() => {
    probe.latest.reset();
  });
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
  await act(async () => {
    resolveUpdate(Result.ok(undefined));
    result = await pending;
  });

  expect(probe.latest.state.kind).toBe("idle");
  expect(result).toMatchObject({
    ok: false,
    error: { kind: "invalid-state", reason: "project-switched" },
  });
});

test("openProject invoke pending 中に reset → resolve 時に loaded へ戻らない", async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  let resolveOpen!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((resolve) => {
      resolveOpen = resolve;
    }),
  );
  const probe = renderHook();
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  act(() => {
    probe.latest.reset();
  });

  await act(async () => {
    resolveOpen(Result.ok(payload));
    await pending;
  });

  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("updateColumns builder 形式: queue 実行時の最新 state から command を計算する", async () => {
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

test("updateColumns: doneColumn 削除を伴うのに command.doneColumn 未指定なら hook が拒否 (config 破壊防止)", async () => {
  const probe = renderHook();
  await openLoaded(probe); // doneColumn = "Done"
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
  await act(async () => {
    // Done を削除する操作なのに command.doneColumn を渡さない
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

test("updateColumns: 明示的 command.doneColumn が command.columns に存在しないと hook が拒否 (config 破壊防止)", async () => {
  const probe = renderHook();
  await openLoaded(probe); // doneColumn = "Done"
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
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

test("updateColumns builder が throw した場合 Promise reject せず Result.err を返す", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns(() => {
      throw new Error("builder boom");
    });
  });
  expect(result.ok).toBe(false);
  expect((result as { error: { kind: string } }).error.kind).toBe("tauri");
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("updateColumns builder が null を返した場合 invoke せず Result.ok({ applied: false }) を返す", async () => {
  const probe = renderHook();
  await openLoaded(probe);
  let result!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
  await act(async () => {
    result = await probe.latest.updateColumns(() => null);
  });
  expect(result).toEqual({ ok: true, value: { applied: false } });
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("updateColumns: projectCommandQueue により再 open は先行更新完了を待つ", async () => {
  const probe = renderHook();
  await openLoaded(probe);

  let resolve1!: (r: ResultT<void, TauriError>) => void;
  updateColumnsMock.mockImplementationOnce(
    () =>
      new Promise<ResultT<void, TauriError>>((r) => {
        resolve1 = r;
      }),
  );
  // 2 回目以降は記録だけする
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
  // p1 の invoke が呼ばれて resolve1 が捕捉されるまで microtask を flush
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // 同じ path を再 open する pending を発行 (queue 末尾に積まれて先行更新完了を待つ)
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  let openPending!: Promise<void>;
  act(() => {
    openPending = probe.latest.openProject();
  });

  // p1 を resolve すると queue が進む: p1 完了 → p2 完了 → open 実行
  await act(async () => {
    resolve1(Result.ok(undefined));
    await p1;
    await openPending;
  });
  let result2!: Awaited<ReturnType<ProbeResult["updateColumns"]>>;
  await act(async () => {
    result2 = (await p2) as Awaited<ReturnType<ProbeResult["updateColumns"]>>;
  });
  expect(result2.ok).toBe(true);
  expect(updateColumnsMock).toHaveBeenCalledTimes(2);
});

test("createTask: projectCommandQueue により再 open は createTask 完了を待ち、createTask は元 version で成功する", async () => {
  const onError = vi.fn();
  const probe = renderHook({ onError });
  await openLoaded(probe);

  let resolveCreate!: (r: ResultT<Task, TauriError>) => void;
  createTaskMock.mockReturnValueOnce(
    new Promise<ResultT<Task, TauriError>>((r) => {
      resolveCreate = r;
    }),
  );
  let pending!: Promise<Awaited<ReturnType<ProbeResult["createTask"]>>>;
  act(() => {
    pending = probe.latest.createTask({ title: "x", status: "Todo" });
  });

  // 同じ path で再 open: UI は loading になるが queue は createTask 完了を待つ
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  let openPending!: Promise<void>;
  act(() => {
    openPending = probe.latest.openProject();
  });

  // createTask を resolve すると queue が進み、createTask 成功 → 再 open 実行
  let result!: Awaited<ReturnType<ProbeResult["createTask"]>>;
  await act(async () => {
    resolveCreate(Result.ok({ ...taskB }));
    result = await pending;
    await openPending;
  });
  expect(result.ok).toBe(true);
  expect(probe.latest.state.kind).toBe("loaded");
});

// === task-created IPC listener ===

test("loaded 状態で task-created の listen が登録される", async () => {
  const { handlers } = captureListen("task-created");
  const probe = renderHook();
  await openLoaded(probe);
  expect(listenMock).toHaveBeenCalledWith("task-created", expect.any(Function));
  expect(handlers).toHaveLength(1);
});

test("task-created callback を invoke すると state.data.tasks に追加される", async () => {
  const { handlers } = captureListen("task-created");
  const probe = renderHook();
  await openLoaded(probe);
  act(() => {
    handlers[0]({
      payload: {
        task: {
          id: "b",
          title: "B",
          status: "Todo",
          labels: [],
          links: [],
          children: [],
          reverseLinks: [],
          body: "",
          filePath: taskFilePathFixture("tasks/b.md"),
          extras: {},
          warnings: [],
        },
      },
    });
  });
  const tasks = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});

test("parent あり task-created で親の hierarchy.childFilePaths に追加される", async () => {
  const { handlers } = captureListen("task-created");
  const probe = renderHook();
  await openLoaded(probe);
  act(() => {
    handlers[0]({
      payload: {
        task: {
          id: "c",
          title: "C",
          status: "Todo",
          labels: [],
          parent: taskFilePathFixture("tasks/a.md"),
          links: [],
          children: [],
          reverseLinks: [],
          body: "",
          filePath: taskFilePathFixture("tasks/c.md"),
          extras: {},
          warnings: [],
        },
      },
    });
  });
  const tasks = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  const parent = tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/a.md"),
  );
  expect(parent?.hierarchy.childFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("unmount で task-created の unlisten が呼ばれる", async () => {
  const { unlistenFns } = captureListen("task-created");
  const probe = renderHook();
  await openLoaded(probe);
  expect(unlistenFns).toHaveLength(1);
  await act(async () => {
    root?.unmount();
    root = null;
    await Promise.resolve();
  });
  expect(unlistenFns[0]).toHaveBeenCalled();
});

test("mount 直後 (idle) から 5 event の listen が登録される", async () => {
  captureListen("task-created");
  renderHook();
  await act(async () => {
    await Promise.resolve();
  });
  expect(listenMock).toHaveBeenCalledTimes(5);
  expect(listenMock).toHaveBeenCalledWith("task-created", expect.any(Function));
});

test("openProject 進行中 (loading) も 5 event の listen を維持する", async () => {
  captureListen("task-created");
  let resolveDialog!: (r: ResultT<string | null, TauriError>) => void;
  openDirectoryDialogMock.mockReturnValueOnce(
    new Promise<ResultT<string | null, TauriError>>((res) => {
      resolveDialog = res;
    }),
  );
  const probe = renderHook();
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(listenMock).toHaveBeenCalledTimes(5);
  // teardown
  await act(async () => {
    resolveDialog(Result.ok(null));
    await pending;
  });
});

test("openProject 失敗 (error 状態) も 5 event の listen を維持する", async () => {
  captureListen("task-created");
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.err(new TauriError("NOT_FOUND", "no")),
  );
  const probe = renderHook({ onError: () => {} });
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
  expect(probe.latest.state.kind).toBe("error");
  expect(listenMock).toHaveBeenCalledTimes(5);
});

test("プロジェクト切替で task-created listener を再登録しない", async () => {
  const { handlers, unlistenFns } = captureListen("task-created");
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlers).toHaveLength(1);

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [taskB],
      columns: ["Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });

  expect(unlistenFns[0]).not.toHaveBeenCalled();
  expect(handlers).toHaveLength(1);
});

test("open-start 直後の race: loading 中に旧 callback が発火しても previousLoaded が変化しない", async () => {
  const { handlers } = captureListen("task-created");
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlers).toHaveLength(1);
  const oldHandler = handlers[0];

  // openProject(P2) を発行して loading 状態に遷移させ、invoke を pending にしておく
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  let resolveInvoke!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((resolve) => {
      resolveInvoke = resolve;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  // dialog 解決 + dispatch(open-start) まで進めて loading にする
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(probe.latest.state.kind).toBe("loading");

  // 旧 listener の callback を invoke する (cleanup 前の race を模擬)
  act(() => {
    oldHandler({
      payload: {
        task: {
          id: "z",
          title: "Z",
          status: "Todo",
          labels: [],
          links: [],
          children: [],
          reverseLinks: [],
          body: "",
          filePath: taskFilePathFixture("tasks/z.md"),
          extras: {},
          warnings: [],
        },
      },
    });
  });

  // loading.previousLoaded.data.tasks が汚染されていないこと
  const loadingState = probe.latest.state as {
    kind: "loading";
    previousLoaded?: { data: { tasks: Task[] } };
  };
  expect(
    loadingState.previousLoaded?.data.tasks.map((t) => t.filePath),
  ).toEqual([taskFilePathFixture("tasks/a.md")]);

  // teardown: invoke を成功させる
  await act(async () => {
    resolveInvoke(
      Result.ok({
        loadWarnings: [],
        session: WATCHER_SESSION_FIXTURE,
        tasks: [taskB],
        columns: ["Done"],
        projections: new Map(),
        milestoneProjections: new Map(),
        taskTree: [],
      }),
    );
    await pending;
  });
});

test("task-created の listen Promise pending 中の unmount でも解決後 UnlistenFn が呼ばれる", async () => {
  let resolveListen!: (fn: UnlistenFnT) => void;
  const unlistenLate = vi.fn();
  const pendingPromise = new Promise<UnlistenFnT>((resolve) => {
    resolveListen = resolve;
  });
  const promiseByEvent: Record<string, Promise<UnlistenFnT>> = {
    "task-created": pendingPromise,
  };
  listenMock.mockImplementation(((name) => {
    return promiseByEvent[name] ?? Promise.resolve(vi.fn());
  }) as typeof listenInvoke);

  renderHook();
  await act(async () => {
    await Promise.resolve();
  });
  // task-created の listen は呼ばれたが Promise はまだ pending
  expect(listenMock).toHaveBeenCalledWith("task-created", expect.any(Function));

  act(() => {
    root?.unmount();
    root = null;
  });
  // 後から listen の Promise を resolve
  resolveListen(unlistenLate);
  await Promise.resolve();
  await Promise.resolve();
  expect(unlistenLate).toHaveBeenCalled();
});

// === task-updated IPC listener ===

const taskAUpdatedPayload: TaskPayload = {
  id: "a",
  title: "A2",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/a.md"),
  extras: {},
  warnings: [],
};

test("loaded 状態で task-updated の listen が登録される", async () => {
  const { handlers } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  expect(listenMock).toHaveBeenCalledWith("task-updated", expect.any(Function));
  expect(handlers).toHaveLength(1);
});

test("task-updated callback で一致 filePath の task が差し替わる", async () => {
  const { handlers } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  act(() => {
    handlers[0]({ payload: { task: taskAUpdatedPayload } });
  });
  const tasks = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  const updated = tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/a.md"),
  );
  expect(updated?.title).toBe("A2");
  expect(tasks).toHaveLength(1);
});

test("filePath 不一致の task-updated は内容上 state を変化させない (no-op)", async () => {
  const { handlers } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  const before = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  act(() => {
    handlers[0]({
      payload: {
        task: {
          ...taskAUpdatedPayload,
          filePath: taskFilePathFixture("tasks/missing.md"),
        },
      },
    });
  });
  const after = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(after).toEqual(before);
});

test("unmount で task-updated の unlisten が呼ばれる", async () => {
  const { unlistenFns } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  expect(unlistenFns).toHaveLength(1);
  await act(async () => {
    root?.unmount();
    root = null;
    await Promise.resolve();
  });
  expect(unlistenFns[0]).toHaveBeenCalled();
});

test("プロジェクト切替で task-updated listener を再登録しない", async () => {
  const { handlers, unlistenFns } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlers).toHaveLength(1);

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [taskB],
      columns: ["Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });

  expect(unlistenFns[0]).not.toHaveBeenCalled();
  expect(handlers).toHaveLength(1);
});

type ListenerLifecycleCase = {
  kind: "idle" | "loading" | "error";
  setup: (probe: { latest: ProbeResult }) => Promise<() => Promise<void>>;
};

const listenerLifecycleCases: ListenerLifecycleCase[] = [
  {
    kind: "idle",
    setup: async () => {
      await act(async () => {
        await Promise.resolve();
      });
      return async () => {};
    },
  },
  {
    kind: "loading",
    setup: async (probe) => {
      let resolveDialog!: (r: ResultT<string | null, TauriError>) => void;
      openDirectoryDialogMock.mockReturnValueOnce(
        new Promise<ResultT<string | null, TauriError>>((res) => {
          resolveDialog = res;
        }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = probe.latest.openProject();
      });
      await act(async () => {
        await Promise.resolve();
      });
      return async () => {
        await act(async () => {
          resolveDialog(Result.ok(null));
          await pending;
        });
      };
    },
  },
  {
    kind: "error",
    setup: async (probe) => {
      openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
      openProjectMock.mockResolvedValueOnce(
        Result.err(new TauriError("NOT_FOUND", "no")),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = probe.latest.openProject();
      });
      await act(async () => {
        await pending;
      });
      return async () => {};
    },
  },
];

test.each(
  listenerLifecycleCases,
)("$kind 状態でも task-updated の listen が登録済み", async ({ setup }) => {
  captureListen("task-updated");
  const probe = renderHook({ onError: () => {} });
  const teardown = await setup(probe);
  expect(listenMock).toHaveBeenCalledWith("task-updated", expect.any(Function));
  await teardown();
});

test("open-start 直後の race: loading 中に旧 task-updated callback が発火しても previousLoaded が変化しない", async () => {
  const { handlers } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlers).toHaveLength(1);
  const oldHandler = handlers[0];

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  let resolveInvoke!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((resolve) => {
      resolveInvoke = resolve;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(probe.latest.state.kind).toBe("loading");

  act(() => {
    oldHandler({
      payload: { task: { ...taskAUpdatedPayload, title: "Z" } },
    });
  });

  const loadingState = probe.latest.state as {
    kind: "loading";
    previousLoaded?: { data: { tasks: Task[] } };
  };
  expect(loadingState.previousLoaded?.data.tasks[0].title).toBe("A");

  await act(async () => {
    resolveInvoke(
      Result.ok({
        loadWarnings: [],
        session: WATCHER_SESSION_FIXTURE,
        tasks: [taskB],
        columns: ["Done"],
        projections: new Map(),
        milestoneProjections: new Map(),
        taskTree: [],
      }),
    );
    await pending;
  });
});

test("task-updated の listen Promise pending 中の unmount でも解決後 UnlistenFn が呼ばれる", async () => {
  let resolveListen!: (fn: UnlistenFnT) => void;
  const unlistenLate = vi.fn();
  const pendingPromise = new Promise<UnlistenFnT>((resolve) => {
    resolveListen = resolve;
  });
  const promiseByEvent: Record<string, Promise<UnlistenFnT>> = {
    "task-updated": pendingPromise,
  };
  listenMock.mockImplementation(((name) => {
    return promiseByEvent[name] ?? Promise.resolve(vi.fn());
  }) as typeof listenInvoke);

  renderHook();
  await act(async () => {
    await Promise.resolve();
  });
  expect(listenMock).toHaveBeenCalledWith("task-updated", expect.any(Function));

  act(() => {
    root?.unmount();
    root = null;
  });
  resolveListen(unlistenLate);
  await Promise.resolve();
  await Promise.resolve();
  expect(unlistenLate).toHaveBeenCalled();
});

test("payload.task が undefined の task-updated は dispatch しない", async () => {
  const { handlers } = captureListen("task-updated");
  const probe = renderHook();
  await openLoaded(probe);
  const before = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  act(() => {
    handlers[0]({
      payload: {} as unknown as { task: TaskPayload },
    });
  });
  const after = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(after).toBe(before);
});

// === task-deleted IPC listener ===

const captureListenAll = <P,>(
  eventNames: readonly string[],
): CaptureMultiResult<P> => installCaptureListen<P>(eventNames);

test("loaded 状態で task-deleted の listen が登録される", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  expect(listenMock).toHaveBeenCalledWith("task-deleted", expect.any(Function));
  expect(handlers).toHaveLength(1);
});

test("task-deleted callback で一致 filePath の task が state.data.tasks から除去される", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  act(() => {
    handlers[0]({ payload: { filePath: taskFilePathFixture("tasks/a.md") } });
  });
  const tasks = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(tasks).toHaveLength(0);
});

test("filePath 不一致の task-deleted は内容上 state を変化させない (no-op)", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  const before = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  act(() => {
    handlers[0]({
      payload: { filePath: taskFilePathFixture("tasks/missing.md") },
    });
  });
  const after = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(after).toEqual(before);
});

test("unmount で task-deleted の unlisten が呼ばれる", async () => {
  const { unlistenFns } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  expect(unlistenFns).toHaveLength(1);
  await act(async () => {
    root?.unmount();
    root = null;
    await Promise.resolve();
  });
  expect(unlistenFns[0]).toHaveBeenCalled();
});

test("プロジェクト切替で task-deleted listener を再登録しない", async () => {
  const { handlers, unlistenFns } = captureListen<{ filePath: string }>(
    "task-deleted",
  );
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlers).toHaveLength(1);

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [taskB],
      columns: ["Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });

  expect(unlistenFns[0]).not.toHaveBeenCalled();
  expect(handlers).toHaveLength(1);
});

test.each(
  listenerLifecycleCases,
)("$kind 状態でも task-deleted の listen が登録済み", async ({ setup }) => {
  captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook({ onError: () => {} });
  const teardown = await setup(probe);
  expect(listenMock).toHaveBeenCalledWith("task-deleted", expect.any(Function));
  await teardown();
});

test("open-start 直後の race: loading 中に旧 task-deleted callback が発火しても previousLoaded が変化しない", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlers).toHaveLength(1);
  const oldHandler = handlers[0];

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/q"));
  let resolveInvoke!: (r: ResultT<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<ResultT<OpenProjectPayload, TauriError>>((resolve) => {
      resolveInvoke = resolve;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(probe.latest.state.kind).toBe("loading");

  act(() => {
    oldHandler({ payload: { filePath: taskFilePathFixture("tasks/a.md") } });
  });

  const loadingState = probe.latest.state as {
    kind: "loading";
    previousLoaded?: { data: { tasks: Task[] } };
  };
  expect(
    loadingState.previousLoaded?.data.tasks.map((t) => t.filePath),
  ).toEqual([taskFilePathFixture("tasks/a.md")]);

  await act(async () => {
    resolveInvoke(
      Result.ok({
        loadWarnings: [],
        session: WATCHER_SESSION_FIXTURE,
        tasks: [taskB],
        columns: ["Done"],
        projections: new Map(),
        milestoneProjections: new Map(),
        taskTree: [],
      }),
    );
    await pending;
  });
});

test("task-deleted の listen Promise pending 中の unmount でも解決後 UnlistenFn が呼ばれる", async () => {
  let resolveListen!: (fn: UnlistenFnT) => void;
  const unlistenLate = vi.fn();
  const pendingPromise = new Promise<UnlistenFnT>((resolve) => {
    resolveListen = resolve;
  });
  const promiseByEvent: Record<string, Promise<UnlistenFnT>> = {
    "task-deleted": pendingPromise,
  };
  listenMock.mockImplementation(((name) => {
    return promiseByEvent[name] ?? Promise.resolve(vi.fn());
  }) as typeof listenInvoke);

  renderHook();
  await act(async () => {
    await Promise.resolve();
  });
  expect(listenMock).toHaveBeenCalledWith("task-deleted", expect.any(Function));

  act(() => {
    root?.unmount();
    root = null;
  });
  resolveListen(unlistenLate);
  await Promise.resolve();
  await Promise.resolve();
  expect(unlistenLate).toHaveBeenCalled();
});

test("payload.filePath が undefined の task-deleted は dispatch しない", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  const before = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  act(() => {
    handlers[0]({
      payload: {} as unknown as { filePath: string },
    });
  });
  const after = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(after).toBe(before);
});

test("payload.filePath が string でない (number 等) の task-deleted は dispatch しない", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const probe = renderHook();
  await openLoaded(probe);
  const before = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  act(() => {
    handlers[0]({
      payload: { filePath: 42 } as unknown as { filePath: string },
    });
  });
  const after = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(after).toBe(before);
});

test("parent あり task の filePath 削除で子の parent も未設定になる", async () => {
  const { handlers } = captureListen<{ filePath: string }>("task-deleted");
  const childPayload: TaskPayload = {
    id: "c",
    title: "C",
    status: "Todo",
    labels: [],
    parent: taskFilePathFixture("tasks/a.md"),
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: taskFilePathFixture("tasks/c.md"),
    extras: {},
    warnings: [],
  };
  const childTask = Task.fromPayload(childPayload);
  // openLoaded uses default payload = [taskA], so override with parent/child setup
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [taskA, childTask],
      columns: ["Todo", "Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
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

  act(() => {
    handlers[0]({ payload: { filePath: taskFilePathFixture("tasks/a.md") } });
  });
  const tasks = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
  const child = tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/c.md"),
  );
  expect(child?.hierarchy.parentFilePath).toBeUndefined();
});

test("rename シーケンス: task-deleted handler → task-created handler 連続発火で最終的にカードが入れ替わる", async () => {
  const { handlersByEvent } = captureListenAll<
    { task: TaskPayload } | { filePath: string }
  >(["task-deleted", "task-created"]);
  const probe = renderHook();
  await openLoaded(probe);
  expect(handlersByEvent["task-deleted"]).toHaveLength(1);
  expect(handlersByEvent["task-created"]).toHaveLength(1);

  const newTaskPayload: TaskPayload = {
    id: "a",
    title: "A",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: taskFilePathFixture("tasks/a-renamed.md"),
    extras: {},
    warnings: [],
  };

  act(() => {
    const deleteHandler = handlersByEvent["task-deleted"][0] as (event: {
      payload: { filePath: string };
    }) => void;
    deleteHandler({ payload: { filePath: taskFilePathFixture("tasks/a.md") } });
  });
  act(() => {
    const createHandler = handlersByEvent["task-created"][0] as (event: {
      payload: { task: TaskPayload };
    }) => void;
    createHandler({ payload: { task: newTaskPayload } });
  });

  const tasks = (probe.latest.state as { data: { tasks: Task[] } }).data.tasks;
  expect(tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/a-renamed.md"),
  ]);
});

// === reorderColumns ===

const threeColumnPayload: OpenProjectPayload = {
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks: [],
  columns: ["A", "B", "C"],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
};

const openLoadedThree = async (probe: { latest: ProbeResult }) => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p3"));
  openProjectMock.mockResolvedValueOnce(Result.ok(threeColumnPayload));
  getColumnsMock.mockResolvedValueOnce(
    Result.ok({
      columns: [
        { name: "A", order: 0 },
        { name: "B", order: 1 },
        { name: "C", order: 2 },
      ],
      doneColumn: "C",
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.openProject();
  });
  await act(async () => {
    await pending;
  });
};

test("reorderColumns (idle) → invalid-state を即返す、invoke 未呼び出し", async () => {
  const probe = renderHook();
  let result!: Awaited<ReturnType<ProbeResult["reorderColumns"]>>;
  await act(async () => {
    result = await probe.latest.reorderColumns("A", "C");
  });
  expect(result).toMatchObject({ ok: false, error: { kind: "invalid-state" } });
  expect(updateColumnsMock).not.toHaveBeenCalled();
});

test("reorderColumns ('A','A') no-op → applied=false、invoke / dispatch 未発生", async () => {
  const probe = renderHook();
  await openLoadedThree(probe);
  const before = (
    probe.latest.state as { data: { columns: { name: string }[] } }
  ).data.columns.map((c) => c.name);
  let result!: Awaited<ReturnType<ProbeResult["reorderColumns"]>>;
  await act(async () => {
    result = await probe.latest.reorderColumns("A", "A");
  });
  expect(result).toEqual({ ok: true, value: { applied: false } });
  expect(updateColumnsMock).not.toHaveBeenCalled();
  const after = (
    probe.latest.state as { data: { columns: { name: string }[] } }
  ).data.columns.map((c) => c.name);
  expect(after).toEqual(before);
});

test("reorderColumns ('A','C') 成功 → invoke が期待 columns で呼ばれる + state 更新 + applied=true", async () => {
  const probe = renderHook();
  await openLoadedThree(probe);
  updateColumnsMock.mockResolvedValueOnce(Result.ok(undefined));
  let result!: Awaited<ReturnType<ProbeResult["reorderColumns"]>>;
  await act(async () => {
    result = await probe.latest.reorderColumns("A", "C");
  });
  expect(result).toEqual({ ok: true, value: { applied: true } });
  expect(updateColumnsMock).toHaveBeenCalledTimes(1);
  expect(updateColumnsMock).toHaveBeenCalledWith({
    columns: [
      { name: "B", order: 0 },
      { name: "C", order: 1 },
      { name: "A", order: 2 },
    ],
    renames: [],
    doneColumn: undefined,
  });
  const data = (probe.latest.state as { data: { columns: { name: string }[] } })
    .data;
  expect(data.columns.map((c) => c.name)).toEqual(["B", "C", "A"]);
});

test("reorderColumns 失敗 → state.data.columns が元の順序にロールバックされる", async () => {
  const probe = renderHook();
  await openLoadedThree(probe);
  updateColumnsMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );
  let result!: Awaited<ReturnType<ProbeResult["reorderColumns"]>>;
  await act(async () => {
    result = await probe.latest.reorderColumns("A", "C");
  });
  expect(result).toMatchObject({ ok: false, error: { kind: "tauri" } });
  const data = (probe.latest.state as { data: { columns: { name: string }[] } })
    .data;
  expect(data.columns.map((c) => c.name)).toEqual(["A", "B", "C"]);
});

test("reorderColumns: callbacks.onOptimisticApplied / onRollback が想定 event で発火", async () => {
  const probe = renderHook();
  await openLoadedThree(probe);
  updateColumnsMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );
  const onOptimisticApplied = vi.fn();
  const onRollback = vi.fn();
  await act(async () => {
    await probe.latest.reorderColumns("A", "C", {
      onOptimisticApplied,
      onRollback,
    });
  });
  expect(onOptimisticApplied).toHaveBeenCalledTimes(1);
  expect(onOptimisticApplied).toHaveBeenCalledWith({
    fromColumnName: "A",
    toColumnName: "C",
    columnName: "A",
    fromIndex: 0,
    toIndex: 2,
  });
  expect(onRollback).toHaveBeenCalledTimes(1);
  expect(onRollback).toHaveBeenCalledWith({
    fromColumnName: "A",
    toColumnName: "C",
    columnName: "A",
    fromIndex: 0,
    toIndex: 2,
  });
});

test("reorderColumns: queue 内で fromColumnName が削除済みなら applied=false / invoke / dispatch / callback すべて未発生", async () => {
  const probe = renderHook();
  await openLoadedThree(probe);

  // 1 回目: A を削除する updateColumns を enqueue（解決を遅らせる）
  let resolveDelete!: (r: ResultT<void, TauriError>) => void;
  updateColumnsMock.mockImplementationOnce(
    () =>
      new Promise<ResultT<void, TauriError>>((r) => {
        resolveDelete = r;
      }),
  );

  let deletePromise!: Promise<unknown>;
  act(() => {
    deletePromise = probe.latest.updateColumns({
      columns: [
        { name: "B", order: 0 },
        { name: "C", order: 1 },
      ],
      renames: [],
      doneColumn: "C",
    });
  });

  const onOptimisticApplied = vi.fn();
  const onRollback = vi.fn();
  let reorderPromise!: Promise<
    Awaited<ReturnType<ProbeResult["reorderColumns"]>>
  >;
  act(() => {
    reorderPromise = probe.latest.reorderColumns("A", "C", {
      onOptimisticApplied,
      onRollback,
    });
  });

  await act(async () => {
    await Promise.resolve();
  });
  expect(updateColumnsMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveDelete(Result.ok(undefined));
    await deletePromise;
  });
  const result = await act(async () => reorderPromise);

  expect(result).toEqual({ ok: true, value: { applied: false } });
  expect(updateColumnsMock).toHaveBeenCalledTimes(1);
  expect(onOptimisticApplied).not.toHaveBeenCalled();
  expect(onRollback).not.toHaveBeenCalled();
  const data = (probe.latest.state as { data: { columns: { name: string }[] } })
    .data;
  expect(data.columns.map((c) => c.name)).toEqual(["B", "C"]);
});

// === watcher session の受け渡し ===

test("open 応答の session が ProjectData.watcherSession に格納される", async () => {
  const probe = renderHook();

  await openLoaded(probe);

  const state = probe.latest.state;
  expect(state.kind).toBe("loaded");
  expect(state.kind === "loaded" && state.data.watcherSession).toBe(
    WATCHER_SESSION_FIXTURE,
  );
});

test("watcherSession は openRequestId と併存し、互いを上書きしない", async () => {
  const probe = renderHook();

  await openLoaded(probe);

  const state = probe.latest.state;
  expect(state.kind === "loaded" && state.data.openRequestId).toBe(1);
  expect(state.kind === "loaded" && state.data.watcherSession.projectKey).toBe(
    "/test/project",
  );
});
