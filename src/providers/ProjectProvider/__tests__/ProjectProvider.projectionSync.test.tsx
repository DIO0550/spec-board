import { listen as listenInvoke } from "@tauri-apps/api/event";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskProjection } from "@/domains/task-projection";
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
  id: "tasks/a.md",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
});

const openPayload: OpenProjectPayload = {
  tasks: [taskA],
  columns: ["Todo", "Done"],
  projections: new Map([
    [
      "tasks/a.md",
      {
        subIssueProgress: { done: 0, total: 1 },
        isDone: false,
        childFilePaths: ["tasks/b.md"],
      },
    ],
  ]),
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
  childFilePaths: ["tasks/b.md"],
});

const getTasksOk = (map: ReadonlyMap<string, TaskProjection>) =>
  Result.ok({ tasks: [], projections: map, session: WATCHER_SESSION_FIXTURE });

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
  getTasksMock.mockResolvedValue(getTasksOk(new Map()));
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
};
let latest: Captured | null = null;

const Probe = () => {
  const { state } = useProjectState();
  const { openProjectByPath } = useProjectSessionActions();
  const { reorderColumns } = useProjectColumnActions();
  latest = { state, openProjectByPath, reorderColumns };
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

const getTasksCalls = (): number => getTasksMock.mock.calls.length;

test("open 直後は get_tasks を呼ばない（payload の projection が最新）", async () => {
  installCaptureListen();

  await mountLoaded();
  await flush();

  expect(getTasksCalls()).toBe(0);
  expect(currentProjections().get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 0,
    total: 1,
  });
});

test("task-updated で tasks 参照が変われば get_tasks が 1 回呼ばれる", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();

  expect(getTasksCalls()).toBe(1);
});

test("task-created / task-deleted でも再同期する", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  await flush();

  fire(handlers, "task-created", { task: makeTaskPayload("tasks/b.md", "B") });
  await flush();
  fire(handlers, "task-deleted", { filePath: "tasks/b.md" });
  await flush();

  expect(getTasksCalls()).toBe(2);
});

test("応答の projections が state に反映される", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    getTasksOk(new Map([["tasks/a.md", projection(1, 3)]])),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();

  expect(currentProjections().get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 1,
    total: 3,
  });
});

test("応答の tasks は state に反映されない（tasks の真実源は差分更新経路）", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(
    Result.ok({
      tasks: [Task.fromPayload(makeTaskPayload("tasks/zzz.md", "Z"))],
      projections: new Map(),
      session: WATCHER_SESSION_FIXTURE,
    }),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();

  const state = latest?.state;
  const filePaths =
    state?.kind === "loaded" ? state.data.tasks.map((t) => t.filePath) : [];
  expect(filePaths).toEqual(["tasks/a.md"]);
});

test("同じ tasks / columns / doneColumn では再取得しない", async () => {
  const handlers = installCaptureListen();
  await mountLoaded();
  await flush();
  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();

  await flush();

  expect(getTasksCalls()).toBe(1);
});

test("get_tasks 失敗時は projections を据え置く", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValue(Result.err(new TauriError("UNKNOWN", "fail")));
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();

  expect(currentProjections().get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 0,
    total: 1,
  });
});

test("get_tasks 失敗後も次の tasks 変化で再試行される", async () => {
  const handlers = installCaptureListen();
  getTasksMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "fail")),
  );
  getTasksMock.mockResolvedValue(
    getTasksOk(new Map([["tasks/a.md", projection(2, 2)]])),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();
  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A3") });
  await flush();

  expect(getTasksCalls()).toBe(2);
  expect(currentProjections().get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 2,
    total: 2,
  });
});

test("in-flight 中の連続更新は畳み込まれ invoke が 2 本に収まる", async () => {
  const handlers = installCaptureListen();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  getTasksMock.mockImplementationOnce(async () => {
    await firstGate;
    return getTasksOk(new Map([["tasks/a.md", projection(1, 1)]]));
  });
  getTasksMock.mockResolvedValue(
    getTasksOk(new Map([["tasks/a.md", projection(2, 2)]])),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();
  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A3") });
  await flush();
  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A4") });
  await flush();
  await act(async () => {
    releaseFirst();
    await Promise.resolve();
  });
  await flush();

  expect(getTasksCalls()).toBe(2);
});

test("in-flight 中に基準が変わると先頭応答は採用されずトレーリング応答が反映される", async () => {
  const handlers = installCaptureListen();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  getTasksMock.mockImplementationOnce(async () => {
    await firstGate;
    return getTasksOk(new Map([["tasks/a.md", projection(1, 1)]]));
  });
  getTasksMock.mockResolvedValue(
    getTasksOk(new Map([["tasks/a.md", projection(2, 2)]])),
  );
  await mountLoaded();
  await flush();

  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A2") });
  await flush();
  fire(handlers, "task-updated", { task: makeTaskPayload("tasks/a.md", "A3") });
  await flush();
  await act(async () => {
    releaseFirst();
    await Promise.resolve();
  });
  await flush();

  expect(currentProjections().get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 2,
    total: 2,
  });
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

test("カラム並び替えは tasks 参照も doneColumn も変わらないが再同期する", async () => {
  installCaptureListen();
  await mountLoaded();
  await flush();
  const before = latest?.state;
  const tasksBefore = before?.kind === "loaded" ? before.data.tasks : null;
  const doneBefore = before?.kind === "loaded" ? before.data.doneColumn : null;

  await act(async () => {
    await latest?.reorderColumns("Todo", "Done");
  });
  await flush();

  const after = latest?.state;
  const tasksAfter = after?.kind === "loaded" ? after.data.tasks : null;
  const doneAfter = after?.kind === "loaded" ? after.data.doneColumn : null;
  // 前提: この経路では tasks 参照も doneColumn 文字列も動かない。
  expect(tasksAfter).toBe(tasksBefore);
  expect(doneAfter).toBe(doneBefore);
  expect(getTasksCalls()).toBe(1);
});
