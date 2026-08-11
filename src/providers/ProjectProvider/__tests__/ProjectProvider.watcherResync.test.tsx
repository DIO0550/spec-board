import { listen as listenInvoke } from "@tauri-apps/api/event";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MilestoneProjectionMap } from "@/domains/milestone-projection";
import { TaskForest } from "@/domains/task-forest";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  createTask as createTaskInvoke,
  getColumns as getColumnsInvoke,
  getTasks as getTasksInvoke,
  type OpenProjectPayload,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { ProjectProvider, type ProjectState } from "..";
import {
  type ProjectEvent,
  useProjectEvents,
  useProjectSessionActions,
  useProjectState,
  useProjectTaskActions,
} from "../context";
import { WATCHER_BUFFER_LIMIT } from "../watcherEnvelopeGate";
import {
  resetWatcherEnvelopeCounters,
  type WatcherEnvelopeOverrides,
  watcherEnvelope,
} from "./watcherEnvelopeHarness";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openDirectoryDialog: vi.fn(),
    openProject: vi.fn(),
    getColumns: vi.fn(),
    getTasks: vi.fn(),
    createTask: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const getTasksMock = vi.mocked(getTasksInvoke);
const listenMock = vi.mocked(listenInvoke);
const createTaskMock = vi.mocked(createTaskInvoke);

type Handler = (event: { payload: unknown }) => void;

const installCaptureListen = () => {
  const handlers: Record<string, Handler[]> = {};
  listenMock.mockImplementation(((name: string, handler: Handler) => {
    const bucket = handlers[name] ?? [];
    handlers[name] = bucket;
    bucket.push(handler);
    return Promise.resolve(vi.fn());
  }) as unknown as typeof listenInvoke);
  return handlers;
};

const makeTaskPayload = (filePath: string, title: string): TaskPayload => ({
  id: filePath,
  title,
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath,
  extras: {},
  warnings: [],
});

const taskA = Task.fromPayload(makeTaskPayload("tasks/a.md", "A"));

const taskProjectionMap = (
  done: number,
  total: number,
  childFilePaths: readonly string[] = [],
): TaskProjectionMap =>
  new Map([
    [
      "tasks/a.md",
      {
        subIssueProgress: { done, total },
        isDone: done === total,
        childFilePaths,
      },
    ],
  ]);

const milestoneProjectionMap = (
  done: number,
  total: number,
  taskFilePaths: readonly string[],
): MilestoneProjectionMap => new Map([["M1", { done, total, taskFilePaths }]]);

const initialTaskProjections = taskProjectionMap(0, 1);
const initialMilestoneProjections = milestoneProjectionMap(0, 1, [
  "tasks/a.md",
]);

const openPayload: OpenProjectPayload = {
  tasks: [taskA],
  columns: ["Todo"],
  projections: initialTaskProjections,
  milestoneProjections: initialMilestoneProjections,
  taskTree: [],
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
};

/** open 応答と同じカラム構成。resync でカラムが変わらない既定値。 */
const OPEN_COLUMNS: Column[] = [{ name: "Todo", order: 0 }];

/** get_tasks の成功応答を作る。session は open と同一世代。 */
const getTasksOk = (
  tasks: Task[],
  eventSeq: number,
  revision: number,
  projections: TaskProjectionMap = new Map(),
  milestoneProjections: MilestoneProjectionMap = new Map(),
  taskTree: TaskForest = TaskForest.empty,
  columns: Column[] = OPEN_COLUMNS,
  doneColumn = "Todo",
) =>
  Result.ok({
    tasks,
    columns,
    doneColumn,
    projections,
    milestoneProjections,
    taskTree,
    loadWarnings: [],
    session: {
      ...WATCHER_SESSION_FIXTURE,
      revision,
      eventSeq,
    },
  });

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type Captured = {
  state: ProjectState;
  openProjectByPath: (path: string) => Promise<void>;
  createTask: ReturnType<typeof useProjectTaskActions>["createTask"];
};
let latest: Captured | null = null;

/** Provider が emit した ProjectEvent（診断通知の結線を検証する）。 */
let observedEvents: ProjectEvent[] = [];

const Probe = () => {
  const { state } = useProjectState();
  const { openProjectByPath } = useProjectSessionActions();
  const { subscribe } = useProjectEvents();
  const { createTask } = useProjectTaskActions();
  latest = { state, openProjectByPath, createTask };
  useEffect(
    () =>
      subscribe((event) => {
        observedEvents.push(event);
      }),
    [subscribe],
  );
  return null;
};

const mountLoaded = async () => {
  openProjectMock.mockResolvedValueOnce(Result.ok(openPayload));
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ProjectProvider, null, createElement(Probe)));
  });
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/p") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const fire = (
  handlers: Record<string, Handler[]>,
  name: string,
  payload: unknown,
  overrides?: WatcherEnvelopeOverrides,
) => {
  act(() => {
    for (const handler of handlers[name] ?? []) {
      handler({ payload: watcherEnvelope(payload, overrides) });
    }
  });
};

const currentTasks = (): Task[] => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.tasks : [];
};

const currentProjections = (): TaskProjectionMap => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.projections : new Map();
};

const currentMilestoneProjections = (): MilestoneProjectionMap => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.milestoneProjections : new Map();
};

const currentColumns = (): Column[] => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.columns : [];
};

const currentDoneColumn = (): string | undefined => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.doneColumn : undefined;
};

const currentData = (): unknown => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data : null;
};

beforeEach(() => {
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue(
    Result.ok({ columns: [{ name: "Todo", order: 0 }], doneColumn: "Todo" }),
  );
  getTasksMock.mockReset();
  // projection 再同期など、テストが明示していない経路からの呼び出しも安全に解決させる。
  getTasksMock.mockResolvedValue(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq,
      WATCHER_SESSION_FIXTURE.revision,
    ),
  );
  listenMock.mockReset();
  createTaskMock.mockReset();
  resetWatcherEnvelopeCounters();
  observedEvents = [];
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

test("open中queue overflowはcommit後にget_tasksを1回だけ要求する", async () => {
  const handlers = installCaptureListen();
  let resolveOpen!: (
    value: Awaited<ReturnType<typeof openProjectInvoke>>,
  ) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<Awaited<ReturnType<typeof openProjectInvoke>>>((resolve) => {
      resolveOpen = resolve;
    }),
  );
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ProjectProvider, null, createElement(Probe)));
  });
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/p") ?? Promise.resolve();
  });
  await flush();

  Array.from({ length: WATCHER_BUFFER_LIMIT + 1 }).forEach((_, index) => {
    fire(handlers, "task-created", {
      task: makeTaskPayload(`tasks/queued-${index}.md`, `Q${index}`),
    });
  });

  await act(async () => {
    resolveOpen(Result.ok(openPayload));
    await pending;
  });
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
});

test("queue overflowのない通常openは追加get_tasksを呼ばない", async () => {
  installCaptureListen();
  await mountLoaded();
  await flush();

  expect(getTasksMock).not.toHaveBeenCalled();
});

test("open response前のwatcher-resync-requiredはcommit後に再取得する", async () => {
  const handlers = installCaptureListen();
  let resolveOpen!: (
    value: Awaited<ReturnType<typeof openProjectInvoke>>,
  ) => void;
  openProjectMock.mockReturnValueOnce(
    new Promise<Awaited<ReturnType<typeof openProjectInvoke>>>((resolve) => {
      resolveOpen = resolve;
    }),
  );
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ProjectProvider, null, createElement(Probe)));
  });
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/p") ?? Promise.resolve();
  });
  await flush();

  fire(handlers, "watcher-resync-required", { reason: "rescan" });

  await act(async () => {
    resolveOpen(Result.ok(openPayload));
    await pending;
  });
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
});

test("watcher-resync-required は tasks と両 projection を同一 snapshot で反映する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  const projections = taskProjectionMap(1, 2, ["tasks/rescanned.md"]);
  const milestoneProjections = milestoneProjectionMap(1, 2, [
    "tasks/rescanned.md",
    "tasks/a.md",
  ]);
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/rescanned.md", "R"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
      projections,
      milestoneProjections,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/rescanned.md",
  ]);
  expect(currentProjections()).toEqual(projections);
  expect(currentMilestoneProjections()).toEqual(milestoneProjections);
});

test("eventSeq を 1 つ飛ばした envelope で get_tasks が呼ばれ board が復旧する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  const projections = taskProjectionMap(2, 2);
  const milestoneProjections = milestoneProjectionMap(2, 2, [
    "tasks/recovered.md",
    "tasks/a.md",
  ]);
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/recovered.md", "R"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 5,
      WATCHER_SESSION_FIXTURE.revision + 5,
      projections,
      milestoneProjections,
    ),
  );

  fire(
    handlers,
    "task-updated",
    { task: makeTaskPayload("tasks/a.md", "A2") },
    { eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 3 },
  );
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/recovered.md",
  ]);
  expect(currentProjections()).toEqual(projections);
  expect(currentMilestoneProjections()).toEqual(milestoneProjections);
});

test("resync 中に届いた新しい envelope は snapshot 適用後に replay される", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  const replayProjections = taskProjectionMap(2, 2, ["tasks/late.md"]);
  const replayMilestoneProjections = milestoneProjectionMap(2, 2, [
    "tasks/late.md",
    "tasks/a.md",
  ]);
  getTasksMock.mockResolvedValue(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 2,
      WATCHER_SESSION_FIXTURE.revision + 9,
      replayProjections,
      replayMilestoneProjections,
    ),
  );
  let resolveGetTasks!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveGetTasks = resolve;
    }),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  // resync in-flight のあいだに新しい変更が届く。
  fire(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/late.md", "L") },
    {
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2,
      revision: WATCHER_SESSION_FIXTURE.revision + 9,
    },
  );
  await act(async () => {
    resolveGetTasks(
      getTasksOk(
        [taskA],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
        taskProjectionMap(1, 1),
        milestoneProjectionMap(1, 1, ["tasks/a.md"]),
      ),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/a.md",
    "tasks/late.md",
  ]);
  expect(getTasksMock).toHaveBeenCalledTimes(2);
  expect(currentProjections()).toEqual(replayProjections);
  expect(currentMilestoneProjections()).toEqual(replayMilestoneProjections);
});

test("resync 中に届いた古い envelope は snapshot を上書きしない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveGetTasks!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveGetTasks = resolve;
    }),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  fire(
    handlers,
    "task-updated",
    { task: makeTaskPayload("tasks/a.md", "STALE") },
    {
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2,
      revision: WATCHER_SESSION_FIXTURE.revision + 1,
    },
  );
  await act(async () => {
    resolveGetTasks(
      getTasksOk(
        [Task.fromPayload(makeTaskPayload("tasks/a.md", "FRESH"))],
        WATCHER_SESSION_FIXTURE.eventSeq + 2,
        WATCHER_SESSION_FIXTURE.revision + 5,
      ),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.title)).toEqual(["FRESH"]);
});

test("resync 完了後に連番の envelope が 1 件届いても追加の get_tasks は発行されない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
    ),
  );
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  expect(getTasksMock).toHaveBeenCalledTimes(1);

  // baseline を取り直した直後の連番 envelope は gap 扱いされず、そのまま apply される。
  // ここで再び resync に入ると、snapshot が envelope の変更を上書きして title が戻る。
  fire(
    handlers,
    "task-updated",
    { task: makeTaskPayload("tasks/a.md", "A2") },
    {
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2,
      revision: WATCHER_SESSION_FIXTURE.revision + 2,
    },
  );

  expect(currentTasks().map((task) => task.title)).toEqual(["A2"]);
});

test("get_tasks 失敗時は tasks と両 projection を据え置き通知もしない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual(["tasks/a.md"]);
  expect(currentProjections()).toBe(initialTaskProjections);
  expect(currentMilestoneProjections()).toBe(initialMilestoneProjections);
});

test("get_tasks が 1 度失敗しても、次の gap で 2 本目が発行され board が復旧する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/recovered.md", "R"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 9,
      WATCHER_SESSION_FIXTURE.revision + 9,
    ),
  );
  fire(
    handlers,
    "task-updated",
    { task: makeTaskPayload("tasks/a.md", "A2") },
    { eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 5 },
  );
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(2);
  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/recovered.md",
  ]);
});

test("get_tasks が例外を投げても次の envelope が buffer 行に落ちない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockRejectedValueOnce(new Error("network down"));
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 9,
      WATCHER_SESSION_FIXTURE.revision + 9,
    ),
  );
  fire(
    handlers,
    "task-updated",
    { task: makeTaskPayload("tasks/a.md", "A2") },
    { eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 5 },
  );
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(2);
});

test("応答の session が別世代なら dispatch されない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    Result.ok({
      tasks: [Task.fromPayload(makeTaskPayload("tasks/other.md", "O"))],
      columns: OPEN_COLUMNS,
      doneColumn: "Todo",
      projections: taskProjectionMap(1, 1),
      milestoneProjections: milestoneProjectionMap(1, 1, ["tasks/other.md"]),
      taskTree: [],
      loadWarnings: [],
      session: {
        ...WATCHER_SESSION_FIXTURE,
        generation: WATCHER_SESSION_FIXTURE.generation + 1,
      },
    }),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual(["tasks/a.md"]);
  expect(currentProjections()).toBe(initialTaskProjections);
  expect(currentMilestoneProjections()).toBe(initialMilestoneProjections);
});

test("resync-required の 3 連発でも in-flight は 1 本に畳まれる", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveGetTasks!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveGetTasks = resolve;
    }),
  );
  getTasksMock.mockResolvedValue(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 9,
      WATCHER_SESSION_FIXTURE.revision + 9,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveGetTasks(
      getTasksOk(
        [taskA],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
      ),
    );
  });
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(2);
});

test("resync 成功で tasks 参照が変わっても projection 再同期の get_tasks が飛ばない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/changed.md", "C"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
});

test("内容が同一な resync でも projection 再同期の get_tasks が飛ばない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/a.md", "A"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
});

test("旧 project の resync が未解決でも、新 session の要求は塞がれない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveFirst!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  expect(getTasksMock).toHaveBeenCalledTimes(1);

  // 別 project を開いて session（generation）を進める。
  const qOpenProjections = taskProjectionMap(0, 1);
  const qOpenMilestoneProjections = milestoneProjectionMap(0, 1, [
    "tasks/q-open.md",
  ]);
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      ...openPayload,
      tasks: [],
      projections: qOpenProjections,
      milestoneProjections: qOpenMilestoneProjections,
      taskTree: [],
      loadWarnings: [],
      session: {
        ...WATCHER_SESSION_FIXTURE,
        generation: WATCHER_SESSION_FIXTURE.generation + 1,
      },
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/q") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
  const handlersAfterSwitch = handlers;
  await flush();
  // project 切替そのものが projection 再同期を起こすため、以降は差分で数える。
  const callsAfterSwitch = getTasksMock.mock.calls.length;

  const qResyncProjections = taskProjectionMap(1, 1);
  const qResyncMilestoneProjections = milestoneProjectionMap(1, 1, [
    "tasks/q.md",
  ]);
  getTasksMock.mockResolvedValueOnce(
    Result.ok({
      tasks: [Task.fromPayload(makeTaskPayload("tasks/q.md", "Q"))],
      columns: OPEN_COLUMNS,
      doneColumn: "Todo",
      projections: qResyncProjections,
      milestoneProjections: qResyncMilestoneProjections,
      taskTree: [],
      loadWarnings: [],
      session: {
        ...WATCHER_SESSION_FIXTURE,
        generation: WATCHER_SESSION_FIXTURE.generation + 1,
        revision: WATCHER_SESSION_FIXTURE.revision + 1,
        eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 1,
      },
    }),
  );
  fire(
    handlersAfterSwitch,
    "watcher-resync-required",
    { reason: "rescan" },
    { generation: WATCHER_SESSION_FIXTURE.generation + 1 },
  );
  await flush();

  expect(getTasksMock.mock.calls.length).toBeGreaterThan(callsAfterSwitch);

  // 旧 project の応答が遅れて着地しても、新 session の状態を壊さない。
  await act(async () => {
    resolveFirst(
      getTasksOk(
        [Task.fromPayload(makeTaskPayload("tasks/old.md", "OLD"))],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
        taskProjectionMap(9, 9),
        milestoneProjectionMap(9, 9, ["tasks/old.md"]),
      ),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual(["tasks/q.md"]);
  expect(currentProjections()).toEqual(qResyncProjections);
  expect(currentMilestoneProjections()).toEqual(qResyncMilestoneProjections);
});

test("欠番を露呈した診断は toast を出しつつ get_tasks も発行する（結線）", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/recovered.md", "R"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 9,
      WATCHER_SESSION_FIXTURE.revision + 9,
    ),
  );

  fire(
    handlers,
    "watcher-diagnostic",
    { code: "resourceExhausted", message: "boom", paths: [] },
    {
      cacheMutating: false,
      revision: WATCHER_SESSION_FIXTURE.revision,
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 4,
    },
  );
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/recovered.md",
  ]);
  expect(
    observedEvents.filter((event) => event.type === "watcher-diagnostic"),
  ).toEqual([
    {
      type: "watcher-diagnostic",
      code: "resourceExhausted",
      message: "boom",
      changeId: expect.any(String),
    },
  ]);
});

test("resync in-flight のあいだに届いた変更は即時反映されず buffer される", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveGetTasks!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveGetTasks = resolve;
    }),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  fire(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/inflight.md", "I") },
    {
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2,
      revision: WATCHER_SESSION_FIXTURE.revision + 9,
    },
  );

  // 応答が返るまでは反映されない（即時 apply すると古い snapshot に上書きされる）。
  expect(currentTasks().map((task) => task.filePath)).toEqual(["tasks/a.md"]);

  await act(async () => {
    resolveGetTasks(
      getTasksOk(
        [taskA],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
      ),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/a.md",
    "tasks/inflight.md",
  ]);
});

test("旧 project の応答が新 session の resync より先に着地しても buffer を壊さない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveOld!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  const nextGeneration = WATCHER_SESSION_FIXTURE.generation + 1;
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      ...openPayload,
      loadWarnings: [],
      session: { ...WATCHER_SESSION_FIXTURE, generation: nextGeneration },
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/q") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
  await flush();

  // 新 session で resync を開始し、その in-flight 中に旧 project の応答を着地させる。
  let resolveNew!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveNew = resolve;
    }),
  );
  fire(
    handlers,
    "watcher-resync-required",
    { reason: "rescan" },
    {
      generation: nextGeneration,
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 1,
      revision: WATCHER_SESSION_FIXTURE.revision + 1,
    },
  );
  await flush();
  fire(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/new.md", "N") },
    {
      generation: nextGeneration,
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2,
      revision: WATCHER_SESSION_FIXTURE.revision + 3,
    },
  );

  await act(async () => {
    resolveOld(
      getTasksOk(
        [Task.fromPayload(makeTaskPayload("tasks/old.md", "OLD"))],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
      ),
    );
  });
  await flush();

  await act(async () => {
    resolveNew(
      Result.ok({
        tasks: [taskA],
        columns: OPEN_COLUMNS,
        doneColumn: "Todo",
        projections: new Map(),
        milestoneProjections: new Map(),
        taskTree: [],
        loadWarnings: [],
        session: {
          ...WATCHER_SESSION_FIXTURE,
          generation: nextGeneration,
          revision: WATCHER_SESSION_FIXTURE.revision + 1,
          eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 1,
        },
      }),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/a.md",
    "tasks/new.md",
  ]);
});

test("buffer 溢れ由来の 2 本目の取得中も、届いた変更は即時反映されず replay される", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  // 1 本目: 応答を保留したまま buffer を溢れさせる。
  let resolveFirst!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  for (let index = 0; index <= WATCHER_BUFFER_LIMIT; index += 1) {
    fire(
      handlers,
      "task-created",
      { task: makeTaskPayload(`tasks/flood-${index}.md`, "F") },
      {
        eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2 + index,
        revision: WATCHER_SESSION_FIXTURE.revision + 2 + index,
      },
    );
  }

  // 2 本目: 溢れの補償として発行される。応答は保留しておく。
  let resolveSecond!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveSecond = resolve;
    }),
  );
  // 1 本目の snapshot は flood の最終 watermark と整合させる（BE は flood 分の
  // 連番を実際に消費しているため、それより古い eventSeq を返すのは不自然）。
  const floodLastSeq =
    WATCHER_SESSION_FIXTURE.eventSeq + 2 + WATCHER_BUFFER_LIMIT;
  const overflowProjections = taskProjectionMap(1, 2);
  const overflowMilestoneProjections = milestoneProjectionMap(1, 2, [
    "tasks/flood-last.md",
    "tasks/a.md",
  ]);
  await act(async () => {
    resolveFirst(
      getTasksOk(
        [taskA],
        floodLastSeq,
        WATCHER_SESSION_FIXTURE.revision + 1,
        overflowProjections,
        overflowMilestoneProjections,
      ),
    );
  });
  await flush();
  expect(getTasksMock).toHaveBeenCalledTimes(2);
  expect(currentProjections()).toEqual(overflowProjections);
  expect(currentMilestoneProjections()).toEqual(overflowMilestoneProjections);

  // baseline は floodLastSeq。**その直後の一意な連番**を投げることで、
  // 「gap だから buffer された」ではなく「resyncing だから buffer された」ことを
  // 分離して検出する。
  fire(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/during-second.md", "D") },
    {
      eventSeq: floodLastSeq + 1,
      revision: WATCHER_SESSION_FIXTURE.revision + 500,
    },
  );
  expect(currentTasks().map((task) => task.filePath)).toEqual(["tasks/a.md"]);

  // 2 本目の snapshot はそのイベントより **古い** 版。即時 apply していれば
  // ここで潰され、buffer されていれば replay で復活する。
  await act(async () => {
    resolveSecond(
      getTasksOk([taskA], floodLastSeq, WATCHER_SESSION_FIXTURE.revision + 2),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/a.md",
    "tasks/during-second.md",
  ]);
});

test("読み取り中に mutation が commit したら、古い snapshot を採用せず取り直す", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveStale!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStale = resolve;
    }),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  // 読み取り中にアプリ側の mutation が走る（project command queue の末尾が進む）。
  createTaskMock.mockResolvedValue(
    Result.ok(Task.fromPayload(makeTaskPayload("tasks/created.md", "C"))),
  );
  act(() => {
    void latest?.createTask({ title: "C", status: "Todo" });
  });
  // 取り直し用の応答。mutation 後の版を返す。
  const freshProjections = taskProjectionMap(2, 2);
  const freshMilestoneProjections = milestoneProjectionMap(2, 2, [
    "tasks/after-mutation.md",
    "tasks/a.md",
  ]);
  getTasksMock.mockResolvedValue(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/after-mutation.md", "M"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 2,
      WATCHER_SESSION_FIXTURE.revision + 2,
      freshProjections,
      freshMilestoneProjections,
    ),
  );

  await act(async () => {
    resolveStale(
      getTasksOk(
        [Task.fromPayload(makeTaskPayload("tasks/stale.md", "S"))],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
        taskProjectionMap(1, 1),
        milestoneProjectionMap(1, 1, ["tasks/stale.md"]),
      ),
    );
  });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/after-mutation.md",
  ]);
  expect(currentProjections()).toEqual(freshProjections);
  expect(currentMilestoneProjections()).toEqual(freshMilestoneProjections);
});

test("barrier 待機中に欠番診断が届いても、解放後の取得 1 本で収束する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  // barrier を保留させるため、解決しない mutation を queue に積む。
  // 失敗で終わらせるのは、成功すると tasks が変わって projection 再同期の
  // `get_tasks` が混ざり、watcher 由来の本数を数えられなくなるため。
  let releaseMutation!: () => void;
  createTaskMock.mockReturnValueOnce(
    new Promise((resolve) => {
      releaseMutation = () => {
        resolve(Result.err(new TauriError("UNKNOWN", "declined")));
      };
    }),
  );
  act(() => {
    void latest?.createTask({ title: "C", status: "Todo" });
  });

  // barrier で止まっているあいだに resync を要求する。
  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();
  expect(getTasksMock).not.toHaveBeenCalled();

  // barrier 待ちのあいだに診断が欠番を露呈する。この欠落は「これから投げる」
  // snapshot が含むため、2 本目を発行してはならない。
  fire(
    handlers,
    "watcher-diagnostic",
    { code: "io", message: "boom", paths: [] },
    {
      cacheMutating: false,
      revision: WATCHER_SESSION_FIXTURE.revision,
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 5,
    },
  );

  getTasksMock.mockResolvedValue(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 5,
      WATCHER_SESSION_FIXTURE.revision + 5,
    ),
  );
  await act(async () => {
    releaseMutation();
  });
  await flush();
  await flush();

  expect(getTasksMock).toHaveBeenCalledTimes(1);
});

// ───────── taskTree の atomic 更新（UC-4 の結線） ─────────

const currentTaskTree = (): TaskForest => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.taskTree : TaskForest.empty;
};

const rescannedTree: TaskForest = TaskForest.fromPayload([
  {
    filePath: "tasks/a.md",
    children: [{ filePath: "tasks/rescanned.md", children: [] }],
  },
]);

test("resync では tasks と taskTree が同じ世代の内容で同時に更新される", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [taskA, Task.fromPayload(makeTaskPayload("tasks/rescanned.md", "R"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
      new Map(),
      new Map(),
      rescannedTree,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/a.md",
    "tasks/rescanned.md",
  ]);
  expect(currentTaskTree()).toEqual(rescannedTree);
});

test("resync 後の replay では taskTree が据え置かれ tasks だけが進む", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  let resolveGetTasks!: (value: ReturnType<typeof getTasksOk>) => void;
  getTasksMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveGetTasks = resolve;
    }),
  );
  // replay が tasks を進めると projection 再同期が走る。その応答を保留させて、
  // 「replay 自体は tree を触らない」ことだけを観測する。
  getTasksMock.mockReturnValueOnce(new Promise(() => {}));

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  fire(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/late.md", "L") },
    {
      eventSeq: WATCHER_SESSION_FIXTURE.eventSeq + 2,
      revision: WATCHER_SESSION_FIXTURE.revision + 9,
    },
  );
  await act(async () => {
    resolveGetTasks(
      getTasksOk(
        [taskA],
        WATCHER_SESSION_FIXTURE.eventSeq + 1,
        WATCHER_SESSION_FIXTURE.revision + 1,
        new Map(),
        new Map(),
        rescannedTree,
      ),
    );
  });
  await flush();

  // replay された task-created は tasks だけを進め、tree は resync 時点のまま。
  expect(currentTasks().map((task) => task.filePath)).toContain(
    "tasks/late.md",
  );
  expect(currentTaskTree()).toEqual(rescannedTree);
});

test("世代違いの resync 応答は tasks も taskTree も取り込まない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  const before = currentTaskTree();
  getTasksMock.mockResolvedValueOnce(
    Result.ok({
      tasks: [Task.fromPayload(makeTaskPayload("tasks/other.md", "O"))],
      columns: OPEN_COLUMNS,
      doneColumn: "Todo",
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: rescannedTree,
      loadWarnings: [],
      session: {
        ...WATCHER_SESSION_FIXTURE,
        generation: WATCHER_SESSION_FIXTURE.generation + 1,
      },
    }),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual(["tasks/a.md"]);
  expect(currentTaskTree()).toBe(before);
});

test("resync は tasks と同じ応答の columns / doneColumn を board へ反映する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
      initialTaskProjections,
      initialMilestoneProjections,
      TaskForest.empty,
      [
        { name: "Backlog", order: 0 },
        { name: "Shipped", order: 1 },
      ],
      "Shipped",
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentColumns().map((column) => column.name)).toEqual([
    "Backlog",
    "Shipped",
  ]);
  expect(currentDoneColumn()).toBe("Shipped");
});

test("columns は tasks と 1 回の get_tasks でまとめて取得する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getColumnsMock.mockClear();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [Task.fromPayload(makeTaskPayload("tasks/rescanned.md", "R"))],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentTasks().map((task) => task.filePath)).toEqual([
    "tasks/rescanned.md",
  ]);
  expect(getTasksMock).toHaveBeenCalledTimes(1);
  expect(
    getColumnsMock,
    "別 IPC で取り直すと tasks と columns の revision が混在しうる",
  ).not.toHaveBeenCalled();
});

test("columns に変化が無い resync では ProjectData の参照が据え置かれる", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  const before = currentData();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
      initialTaskProjections,
      initialMilestoneProjections,
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentData()).toBe(before);
  expect(getTasksMock).toHaveBeenCalledTimes(1);
});

test("doneColumn だけが変わった場合も resync で反映される", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      [taskA],
      WATCHER_SESSION_FIXTURE.eventSeq + 1,
      WATCHER_SESSION_FIXTURE.revision + 1,
      initialTaskProjections,
      initialMilestoneProjections,
      TaskForest.empty,
      OPEN_COLUMNS,
      "Done",
    ),
  );

  fire(handlers, "watcher-resync-required", { reason: "rescan" });
  await flush();

  expect(currentDoneColumn()).toBe("Done");
  expect(currentColumns().map((column) => column.name)).toEqual(["Todo"]);
});
