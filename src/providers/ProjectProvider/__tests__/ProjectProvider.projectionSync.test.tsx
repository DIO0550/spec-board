import { listen as listenInvoke } from "@tauri-apps/api/event";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import type {
  MilestoneProjection,
  MilestoneProjectionMap,
} from "@/domains/milestone-projection";
import { TaskForest } from "@/domains/task-forest";
import type {
  TaskProjection,
  TaskProjectionMap,
} from "@/domains/task-projection";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  getColumns as getColumnsInvoke,
  getTasks as getTasksInvoke,
  type OpenProjectPayload,
  openProject as openProjectInvoke,
  updateColumns as updateColumnsInvoke,
} from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { ProjectProvider, type ProjectState } from "..";
import {
  useProjectColumnActions,
  useProjectSessionActions,
  useProjectState,
} from "../context";
import {
  resetWatcherEnvelopeCounters,
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
    updateColumns: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const getTasksMock = vi.mocked(getTasksInvoke);
const updateColumnsMock = vi.mocked(updateColumnsInvoke);
const listenMock = vi.mocked(listenInvoke);

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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const taskA: Task = Task.fromPayload({
  id: taskFilePathFixture("tasks/a.md"),
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/a.md"),
});

const initialMilestoneProjection: MilestoneProjection = {
  done: 0,
  total: 1,
  taskFilePaths: [taskFilePathFixture("tasks/a.md")],
};

const openPayload: OpenProjectPayload = {
  tasks: [taskA],
  columns: ["Todo", "Done"],
  projections: new Map([
    [
      taskFilePathFixture("tasks/a.md"),
      {
        subIssueProgress: { done: 0, total: 1 },
        isDone: false,
        childFilePaths: [taskFilePathFixture("tasks/b.md")],
      },
    ],
  ]),
  milestoneProjections: new Map([["M1", initialMilestoneProjection]]),
  taskTree: [],
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
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

const projection = (done: number, total: number): TaskProjection => ({
  subIssueProgress: { done, total },
  isDone: false,
  childFilePaths: [taskFilePathFixture("tasks/b.md")],
});

const milestoneProjection = (
  done: number,
  total: number,
  taskFilePaths: readonly ReturnType<typeof taskFilePathFixture>[],
): MilestoneProjection => ({ done, total, taskFilePaths });

const milestoneMap = (
  done: number,
  total: number,
  taskFilePaths: readonly ReturnType<typeof taskFilePathFixture>[],
): MilestoneProjectionMap =>
  new Map([["M1", milestoneProjection(done, total, taskFilePaths)]]);

/** open 応答と get_tasks 応答が共有するカラム定義。 */
const OPEN_COLUMNS = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

const getTasksOk = (
  projections: TaskProjectionMap,
  milestoneProjections: MilestoneProjectionMap,
  taskTree: TaskForest = TaskForest.empty,
) =>
  Result.ok({
    tasks: [],
    columns: OPEN_COLUMNS,
    doneColumn: "Done",
    projections,
    milestoneProjections,
    taskTree,
    loadWarnings: [],
    session: WATCHER_SESSION_FIXTURE,
  });

beforeEach(() => {
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getTasksMock.mockReset();
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
  getTasksMock.mockResolvedValue(getTasksOk(new Map(), new Map()));
  updateColumnsMock.mockReset();
  updateColumnsMock.mockResolvedValue(Result.ok(undefined));
  listenMock.mockReset();
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

type Captured = {
  state: ProjectState;
  openProjectByPath: (path: string) => Promise<void>;
  reorderColumns: ReturnType<typeof useProjectColumnActions>["reorderColumns"];
  updateColumns: ReturnType<typeof useProjectColumnActions>["updateColumns"];
};
let latest: Captured | null = null;

const Probe = () => {
  const { state } = useProjectState();
  const { openProjectByPath } = useProjectSessionActions();
  const { reorderColumns, updateColumns } = useProjectColumnActions();
  latest = { state, openProjectByPath, reorderColumns, updateColumns };
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

const fire = (
  handlers: Record<string, Handler[]>,
  name: string,
  payloadValue: unknown,
) => {
  act(() => {
    for (const handler of handlers[name] ?? []) {
      handler({ payload: watcherEnvelope(payloadValue) });
    }
  });
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const currentProjections = (): ReadonlyMap<string, TaskProjection> => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.projections : new Map();
};

const currentMilestoneProjections = (): MilestoneProjectionMap => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.milestoneProjections : new Map();
};

const getTasksCalls = (): number => getTasksMock.mock.calls.length;

test("open 直後は get_tasks を呼ばず payload の両 projection を維持する", async () => {
  installCaptureListen();

  await mountLoaded();
  await flush();

  expect(getTasksCalls()).toBe(0);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 0,
    total: 1,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    initialMilestoneProjection,
  );
});

test("task-updated で tasks 参照が変われば両 projection を再同期する", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 2)]]),
      milestoneMap(1, 2, [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/a.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  expect(getTasksCalls()).toBe(1);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 1,
    total: 2,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(1, 2, [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ]),
  );
});

test("task-created / task-deleted でも両 projection を再同期する", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(0, 2)]]),
      milestoneMap(0, 2, [
        taskFilePathFixture("tasks/a.md"),
        taskFilePathFixture("tasks/b.md"),
      ]),
    ),
  );
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(0, 1)]]),
      milestoneMap(0, 1, [taskFilePathFixture("tasks/a.md")]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-created", {
    task: makeTaskPayload(taskFilePathFixture("tasks/b.md"), "B"),
  });
  await flush();
  const milestoneAfterCreate = currentMilestoneProjections().get("M1");
  fire(handlers, "task-deleted", {
    filePath: taskFilePathFixture("tasks/b.md"),
  });
  await flush();

  expect(getTasksCalls()).toBe(2);
  expect(milestoneAfterCreate).toEqual(
    milestoneProjection(0, 2, [
      taskFilePathFixture("tasks/a.md"),
      taskFilePathFixture("tasks/b.md"),
    ]),
  );
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 0,
    total: 1,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(0, 1, [taskFilePathFixture("tasks/a.md")]),
  );
});

test("応答の両 projections は path 順と done を保って state に同時反映される", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 3)]]),
      milestoneMap(2, 3, [
        taskFilePathFixture("tasks/c.md"),
        taskFilePathFixture("tasks/a.md"),
        taskFilePathFixture("tasks/b.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 1,
    total: 3,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(2, 3, [
      taskFilePathFixture("tasks/c.md"),
      taskFilePathFixture("tasks/a.md"),
      taskFilePathFixture("tasks/b.md"),
    ]),
  );
});

test("応答の tasks は state に反映されない（tasks の真実源は差分更新経路）", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    Result.ok({
      tasks: [
        Task.fromPayload(
          makeTaskPayload(taskFilePathFixture("tasks/zzz.md"), "Z"),
        ),
      ],
      columns: OPEN_COLUMNS,
      doneColumn: "Done",
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
    }),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  const state = latest?.state;
  const filePaths =
    state?.kind === "loaded" ? state.data.tasks.map((t) => t.filePath) : [];
  expect(filePaths).toEqual([taskFilePathFixture("tasks/a.md")]);
});

test("同じ tasks / columns / doneColumn では再取得しない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  await flush();

  expect(getTasksCalls()).toBe(1);
});

test("get_tasks IPC 失敗時は両 projections を据え置く", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(Result.err(new TauriError("UNKNOWN", "fail")));
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 0,
    total: 1,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    initialMilestoneProjection,
  );
});

test("get_tasks 失敗後も次の tasks 変化で再試行される", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "fail")),
  );
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(2, 2)]]),
      milestoneMap(2, 2, [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/a.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A3"),
  });
  await flush();

  expect(getTasksCalls()).toBe(2);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 2,
    total: 2,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(2, 2, [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ]),
  );
});

test("in-flight 中の連続更新は畳み込まれ invoke が 2 本に収まる", async () => {
  const handlers = installCaptureListen();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  getTasksMock.mockImplementationOnce(async () => {
    await firstGate;
    return getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 1)]]),
      milestoneMap(1, 1, [taskFilePathFixture("tasks/stale.md")]),
    );
  });
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(2, 2)]]),
      milestoneMap(2, 2, [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/a.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A3"),
  });
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A4"),
  });
  await flush();
  await act(async () => {
    releaseFirst();
    await Promise.resolve();
  });
  await flush();

  expect(getTasksCalls()).toBe(2);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 2,
    total: 2,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(2, 2, [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ]),
  );
});

test("in-flight 中に基準が変わると先頭応答は採用されずトレーリング応答が反映される", async () => {
  const handlers = installCaptureListen();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  getTasksMock.mockImplementationOnce(async () => {
    await firstGate;
    return getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 1)]]),
      milestoneMap(1, 1, [taskFilePathFixture("tasks/stale.md")]),
    );
  });
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(2, 2)]]),
      milestoneMap(2, 2, [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/a.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A3"),
  });
  await flush();
  await act(async () => {
    releaseFirst();
    await Promise.resolve();
  });
  await flush();

  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 2,
    total: 2,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(2, 2, [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ]),
  );
});

test("同一 path の open 失敗で復元した後は古い応答を捨て両 projection を取り直す", async () => {
  const handlers = installCaptureListen();
  let releaseStale!: () => void;
  const staleGate = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  getTasksMock.mockImplementationOnce(async () => {
    await staleGate;
    return getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 1)]]),
      milestoneMap(1, 1, [taskFilePathFixture("tasks/stale.md")]),
    );
  });
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(2, 2)]]),
      milestoneMap(2, 2, [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/a.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();
  openProjectMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "reopen failed")),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/p") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
  await flush();

  await act(async () => {
    releaseStale();
    await Promise.resolve();
  });
  await flush();

  expect(getTasksCalls()).toBe(2);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 2,
    total: 2,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(2, 2, [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ]),
  );
});

test("project switch 後に旧 project の応答が着地しても両 projection を巻き戻さない", async () => {
  const handlers = installCaptureListen();
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  getTasksMock.mockImplementationOnce(async () => {
    await oldGate;
    return getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 1)]]),
      milestoneMap(1, 1, [taskFilePathFixture("tasks/old.md")]),
    );
  });
  await mountLoaded();
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  const qProjections = new Map([
    [taskFilePathFixture("tasks/q.md"), projection(3, 3)],
  ]);
  const qMilestoneProjections = new Map([
    ["Q", milestoneProjection(3, 3, [taskFilePathFixture("tasks/q.md")])],
  ]);
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      ...openPayload,
      tasks: [
        Task.fromPayload(
          makeTaskPayload(taskFilePathFixture("tasks/q.md"), "Q"),
        ),
      ],
      projections: qProjections,
      milestoneProjections: qMilestoneProjections,
      taskTree: [],
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

  await act(async () => {
    releaseOld();
    await Promise.resolve();
  });
  await flush();

  expect(latest?.state.kind === "loaded" ? latest.state.path : undefined).toBe(
    "/q",
  );
  expect(currentProjections()).toBe(qProjections);
  expect(currentMilestoneProjections()).toBe(qMilestoneProjections);
});

test("未 loaded（idle）では get_tasks を呼ばない", async () => {
  installCaptureListen();
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ProjectProvider, null, createElement(Probe)));
  });

  await flush();

  expect(getTasksCalls()).toBe(0);
});

test("カラム並び替えは mutation queue 完了後に両 projection を再同期する", async () => {
  installCaptureListen();
  let releaseUpdate!: () => void;
  const updateGate = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  updateColumnsMock.mockImplementationOnce(async () => {
    await updateGate;
    return Result.ok(undefined);
  });
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 2)]]),
      milestoneMap(1, 2, [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/a.md"),
      ]),
    ),
  );
  await mountLoaded();
  await flush();
  const before = latest?.state;
  const tasksBefore = before?.kind === "loaded" ? before.data.tasks : null;
  const doneBefore = before?.kind === "loaded" ? before.data.doneColumn : null;

  let pendingReorder: Promise<unknown> = Promise.resolve();
  act(() => {
    pendingReorder =
      latest?.reorderColumns("Todo", "Done") ?? Promise.resolve();
  });
  await flush();
  expect(updateColumnsMock).toHaveBeenCalledTimes(1);
  expect(getTasksCalls()).toBe(0);

  await act(async () => {
    releaseUpdate();
    await pendingReorder;
  });
  await flush();

  const after = latest?.state;
  const tasksAfter = after?.kind === "loaded" ? after.data.tasks : null;
  const doneAfter = after?.kind === "loaded" ? after.data.doneColumn : null;
  // 前提: この経路では tasks 参照も doneColumn 文字列も動かない。
  expect(tasksAfter).toBe(tasksBefore);
  expect(doneAfter).toBe(doneBefore);
  expect(getTasksCalls()).toBe(1);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 1,
    total: 2,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(1, 2, [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ]),
  );
});

test("doneColumn 変更は tasks 参照が同じでも両 projection を再同期する", async () => {
  installCaptureListen();
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 1)]]),
      milestoneMap(1, 1, [taskFilePathFixture("tasks/a.md")]),
    ),
  );
  await mountLoaded();
  await flush();
  const before = latest?.state;
  const tasksBefore = before?.kind === "loaded" ? before.data.tasks : null;

  await act(async () => {
    await latest?.updateColumns({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      renames: [],
      doneColumn: "Todo",
    });
  });
  await flush();

  const after = latest?.state;
  const tasksAfter = after?.kind === "loaded" ? after.data.tasks : null;
  const doneAfter = after?.kind === "loaded" ? after.data.doneColumn : null;
  expect(tasksAfter).toBe(tasksBefore);
  expect(doneAfter).toBe("Todo");
  expect(getTasksCalls()).toBe(1);
  expect(
    currentProjections().get(taskFilePathFixture("tasks/a.md"))
      ?.subIssueProgress,
  ).toEqual({
    done: 1,
    total: 1,
  });
  expect(currentMilestoneProjections().get("M1")).toEqual(
    milestoneProjection(1, 1, [taskFilePathFixture("tasks/a.md")]),
  );
});

// ───────── taskTree の結線 ─────────

const currentTaskTree = (): TaskForest => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.taskTree : TaskForest.empty;
};

const currentData = () => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data : null;
};

const nestedTree: TaskForest = TaskForest.fromPayload([
  {
    filePath: taskFilePathFixture("tasks/a.md"),
    children: [{ filePath: taskFilePathFixture("tasks/b.md"), children: [] }],
  },
]);

test("projections-refreshed で taskTree が新しい内容へ更新される", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(getTasksOk(new Map(), new Map(), nestedTree));
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  expect(currentTaskTree()).toEqual(nestedTree);
});

test("projections と taskTree は同じ dispatch で入る", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([[taskFilePathFixture("tasks/a.md"), projection(1, 2)]]),
      new Map(),
      nestedTree,
    ),
  );
  await mountLoaded();
  await flush();
  const before = currentData();

  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  const after = currentData();
  // 中間で「projections だけ新・tree だけ旧」の data は観測されない。
  expect(after).not.toBe(before);
  expect(
    after?.projections.get(taskFilePathFixture("tasks/a.md"))?.subIssueProgress,
  ).toEqual({
    done: 1,
    total: 2,
  });
  expect(after?.taskTree).toEqual(nestedTree);
});

test("内容不変の同期では data 参照が据え置かれる", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    getTasksOk(
      new Map([
        [
          taskFilePathFixture("tasks/a.md"),
          {
            subIssueProgress: { done: 0, total: 1 },
            isDone: false,
            childFilePaths: [taskFilePathFixture("tasks/b.md")],
          },
        ],
      ]),
      new Map([["M1", initialMilestoneProjection]]),
      TaskForest.empty,
    ),
  );
  await mountLoaded();
  await flush();

  // task-updated 自体は tasks を進めるので data 参照が変わる。ここで見たいのは
  // 「その後に届く projections-refreshed が内容不変なら data を作り直さない」こと
  // なので、event 適用直後・get_tasks 応答適用前の data を基準にする。
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A"),
  });
  const beforeSync = currentData();
  await flush();

  expect(currentData()).toBe(beforeSync);
});

test("get_tasks が失敗しても直前の taskTree を捨てない", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValueOnce(
    getTasksOk(new Map(), new Map(), nestedTree),
  );
  await mountLoaded();
  await flush();
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A2"),
  });
  await flush();

  getTasksMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "失敗")),
  );
  fire(handlers, "task-updated", {
    task: makeTaskPayload(taskFilePathFixture("tasks/a.md"), "A3"),
  });
  await flush();

  expect(currentTaskTree()).toEqual(nestedTree);
});

test("プロジェクト切替に成功すると taskTree が新しいプロジェクトの内容に入れ替わる", async () => {
  installCaptureListen();
  await mountLoaded();
  await flush();

  openProjectMock.mockResolvedValueOnce(
    Result.ok({ ...openPayload, taskTree: nestedTree }),
  );
  await act(async () => {
    await latest?.openProjectByPath("/q");
  });
  await flush();

  expect(currentTaskTree()).toEqual(nestedTree);
});

test("プロジェクト切替の open が失敗しても旧プロジェクトの taskTree を保持する", async () => {
  installCaptureListen();
  openProjectMock.mockResolvedValueOnce(
    Result.ok({ ...openPayload, taskTree: nestedTree }),
  );
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ProjectProvider, null, createElement(Probe)));
  });
  await act(async () => {
    await latest?.openProjectByPath("/p");
  });
  await flush();

  openProjectMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "失敗")),
  );
  await act(async () => {
    await latest?.openProjectByPath("/q");
  });
  await flush();

  expect(currentTaskTree()).toEqual(nestedTree);
});
