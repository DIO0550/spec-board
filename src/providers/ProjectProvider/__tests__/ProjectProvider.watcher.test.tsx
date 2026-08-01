import { listen as listenInvoke } from "@tauri-apps/api/event";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { ProjectProvider, type ProjectState } from "..";
import { useProjectSessionActions, useProjectState } from "../context";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openDirectoryDialog: vi.fn(),
    openProject: vi.fn(),
    getColumns: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const listenMock = vi.mocked(listenInvoke);

type Handler = (event: { payload: unknown }) => void;

/** listen をイベント名ごとに handler / unlisten でキャプチャする。 */
const installCaptureListen = () => {
  const handlers: Record<string, Handler[]> = {};
  const unlistens: Record<string, ReturnType<typeof vi.fn>[]> = {};
  listenMock.mockImplementation(((name: string, handler: Handler) => {
    const unlisten = vi.fn();
    const handlerBucket = handlers[name] ?? [];
    handlers[name] = handlerBucket;
    handlerBucket.push(handler);
    const unlistenBucket = unlistens[name] ?? [];
    unlistens[name] = unlistenBucket;
    unlistenBucket.push(unlisten);
    return Promise.resolve(unlisten);
  }) as unknown as typeof listenInvoke);
  return { handlers, unlistens };
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const taskA: Task = Task.fromPayload({
  id: "a",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
});

const payload: OpenProjectPayload = {
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks: [taskA],
  columns: ["Todo"],
  projections: new Map(),
  milestoneProjections: new Map(),
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

beforeEach(() => {
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: { columns: [{ name: "Todo", order: 0 }], doneColumn: "Todo" },
  });
  listenMock.mockReset();
  nextEventSeq = WATCHER_SESSION_FIXTURE.eventSeq;
  nextRevision = WATCHER_SESSION_FIXTURE.revision;
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
};
let latest: Captured | null = null;

const Probe = () => {
  const { state } = useProjectState();
  const { openProjectByPath } = useProjectSessionActions();
  latest = { state, openProjectByPath };
  return null;
};

/** Provider を mount し、path("/p") を loaded まで進める。 */
const mountLoaded = async (strict = false) => {
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tree = createElement(ProjectProvider, null, createElement(Probe));
  act(() => {
    root?.render(strict ? createElement(StrictMode, null, tree) : tree);
  });
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/p") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
};

const currentTasks = (): Task[] => {
  const state = latest?.state;
  return state?.kind === "loaded" ? state.data.tasks : [];
};

const fire = (
  handlers: Record<string, Handler[]>,
  name: string,
  payloadValue: unknown,
) => {
  act(() => {
    for (const handler of handlers[name] ?? []) {
      handler({ payload: payloadValue });
    }
  });
};

/** envelope の連番 / revision を自動採番するためのカウンタ。 */
let nextEventSeq = WATCHER_SESSION_FIXTURE.eventSeq;
let nextRevision = WATCHER_SESSION_FIXTURE.revision;

/**
 * BE が emit する envelope を組み立てる。
 * @param payloadValue event 固有の payload
 * @param overrides identity / 順序フィールドの差し替え
 * @returns envelope
 */
const envelopeOf = (
  payloadValue: unknown,
  overrides: Partial<{
    projectKey: string;
    generation: number;
    revision: number;
    cacheMutating: boolean;
    eventSeq: number;
  }> = {},
) => {
  nextEventSeq += 1;
  nextRevision += 1;
  const generation = overrides.generation ?? WATCHER_SESSION_FIXTURE.generation;
  const eventSeq = overrides.eventSeq ?? nextEventSeq;
  return {
    projectKey: overrides.projectKey ?? WATCHER_SESSION_FIXTURE.projectKey,
    generation,
    revision: overrides.revision ?? nextRevision,
    cacheMutating: overrides.cacheMutating ?? true,
    eventSeq,
    changeId: `${generation}-${eventSeq}`,
    payload: payloadValue,
  };
};

/**
 * envelope に包んで listen handler を発火する。
 * @param handlers キャプチャ済み handler
 * @param name event 名
 * @param payloadValue event 固有の payload
 * @param overrides identity / 順序フィールドの差し替え
 */
const fireEnvelope = (
  handlers: Record<string, Handler[]>,
  name: string,
  payloadValue: unknown,
  overrides?: Parameters<typeof envelopeOf>[1],
) => {
  fire(handlers, name, envelopeOf(payloadValue, overrides));
};

test("loaded 後 task-created で新 task が state に追加される", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();
  fireEnvelope(handlers, "task-created", {
    task: makeTaskPayload("tasks/b.md", "B"),
  });
  expect(currentTasks().map((t) => t.filePath)).toEqual([
    "tasks/a.md",
    "tasks/b.md",
  ]);
});

test("loaded 後 task-updated で該当 task が置換される", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();
  fireEnvelope(handlers, "task-updated", {
    task: makeTaskPayload("tasks/a.md", "A2"),
  });
  expect(currentTasks().map((t) => t.title)).toEqual(["A2"]);
});

test("loaded 後 task-deleted で該当 task が削除される", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();
  fireEnvelope(handlers, "task-deleted", { filePath: "tasks/a.md" });
  expect(currentTasks()).toEqual([]);
});

test("loadedPath と異なる path の stale handler の event は無視される", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();
  // /p の loaded 時点で登録された handler（capturedPath="/p"）を控える。
  const staleHandler = handlers["task-created"][0];
  // 別 project /other へ切替える。/p 用 handler は古い path を掴んだままになる。
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [],
      columns: ["Todo"],
      projections: new Map(),
      milestoneProjections: new Map(),
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = latest?.openProjectByPath("/other") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
  // stale な /p handler を発火しても、現在 path は /other なので capturedPath ガードで無視。
  act(() => {
    staleHandler({
      payload: envelopeOf({ task: makeTaskPayload("tasks/z.md", "Z") }),
    });
  });
  expect(currentTasks()).toEqual([]);
});

test("StrictMode 下でも task-created 由来の追加は 1 回だけ反映される（CTR-011）", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded(true);
  // StrictMode で effect が二重登録されても、stale unlisten が解除され有効 handler は
  // 実質 1 セッション分。現在有効な handler を発火して二重追加が起きないことを確認する。
  const created = makeTaskPayload("tasks/b.md", "B");
  fireEnvelope(handlers, "task-created", { task: created });
  expect(
    currentTasks().filter((t) => t.filePath === "tasks/b.md"),
  ).toHaveLength(1);
});

test("unmount で全 unlisten が呼ばれる", async () => {
  const { unlistens } = installCaptureListen();
  await mountLoaded();
  const allUnlistens = [
    ...(unlistens["task-created"] ?? []),
    ...(unlistens["task-updated"] ?? []),
    ...(unlistens["task-deleted"] ?? []),
  ];
  expect(allUnlistens.length).toBeGreaterThanOrEqual(3);
  act(() => {
    root?.unmount();
  });
  root = null;
  for (const unlisten of allUnlistens) {
    expect(unlisten).toHaveBeenCalled();
  }
});

test("mount 後に 5 つの watcher event 名が購読される", async () => {
  const { handlers } = installCaptureListen();

  await mountLoaded();

  expect(Object.keys(handlers).sort()).toEqual([
    "task-created",
    "task-deleted",
    "task-updated",
    "watcher-diagnostic",
    "watcher-resync-required",
  ]);
});

test("旧世代の envelope は state を変えない", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();

  fireEnvelope(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/z.md", "Z") },
    { generation: WATCHER_SESSION_FIXTURE.generation + 1 },
  );

  expect(currentTasks().map((t) => t.filePath)).toEqual(["tasks/a.md"]);
});

test("追い越した古い revision の envelope は state を変えない", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();
  fireEnvelope(handlers, "task-updated", {
    task: makeTaskPayload("tasks/a.md", "A2"),
  });

  fireEnvelope(
    handlers,
    "task-updated",
    { task: makeTaskPayload("tasks/a.md", "STALE") },
    { revision: WATCHER_SESSION_FIXTURE.revision },
  );

  expect(currentTasks().map((t) => t.title)).toEqual(["A2"]);
});

test("別 projectKey の envelope は state を変えない", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();

  fireEnvelope(
    handlers,
    "task-created",
    { task: makeTaskPayload("tasks/z.md", "Z") },
    { projectKey: "/other/project" },
  );

  expect(currentTasks().map((t) => t.filePath)).toEqual(["tasks/a.md"]);
});

test("不正な envelope でも例外を投げず state は不変", async () => {
  const { handlers } = installCaptureListen();
  await mountLoaded();

  expect(() => {
    fire(handlers, "task-created", { broken: true });
    fire(handlers, "task-created", null);
  }).not.toThrow();
  expect(currentTasks().map((t) => t.filePath)).toEqual(["tasks/a.md"]);
});
