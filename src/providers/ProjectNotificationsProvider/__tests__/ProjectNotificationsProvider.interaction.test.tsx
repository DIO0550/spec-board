import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { TauriError } from "@/lib/tauri";
import type { ProjectData } from "@/providers/ProjectProvider";
import {
  type ProjectEvent,
  ProjectEventsContext,
} from "@/providers/ProjectProvider/context";
import {
  RecentProjectsProvider,
  useRecentProjects,
} from "@/providers/RecentProjectsProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { Task, type TaskPayload } from "@/types/task";
import { ProjectNotificationsProvider } from "..";
import { watcherDiagnosticMessage } from "../watcherDiagnosticMessage";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  localStorage.clear();
});

/** テスト用の Task を生成する。 */
const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "1",
    title: "T",
    status: "todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "/a.md",
    ...overrides,
  });

/** tasks から ProjectData を組む（columns は通知に無関係なので空）。 */
const dataOf = (tasks: Task[]): ProjectData => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks,
  columns: [],
  doneColumn: undefined,
  projections: new Map(),
  openRequestId: 0,
});

/** 購読者へ ProjectEvent を配信できる制御可能なイベント基盤。 */
const createEventsHarness = () => {
  const listeners = new Set<(event: ProjectEvent) => void>();
  const value = {
    subscribe: (listener: (event: ProjectEvent) => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const emit = (event: ProjectEvent): void => {
    listeners.forEach((listener) => {
      listener(event);
    });
  };
  return { value, emit, listenerCount: (): number => listeners.size };
};

/**
 * ToastProvider / RecentProjectsProvider / 制御可能 events / Notifications を配線して
 * mount する。recentProjects の path 一覧を probe で観測する。
 */
const setup = (
  harnessValue: { subscribe: (l: (e: ProjectEvent) => void) => () => void },
  strict = false,
) => {
  let recentPaths: string[] = [];
  const RecentProbe = () => {
    const { projects } = useRecentProjects();
    recentPaths = projects.map((p) => p.path);
    return null;
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tree = createElement(
    ToastProvider,
    null,
    createElement(
      RecentProjectsProvider,
      null,
      createElement(
        ProjectEventsContext.Provider,
        { value: harnessValue },
        createElement(
          ProjectNotificationsProvider,
          null,
          createElement(RecentProbe),
        ),
      ),
    ),
  );
  act(() => {
    root?.render(strict ? createElement(StrictMode, null, tree) : tree);
  });
  return {
    get recentPaths(): string[] {
      return recentPaths;
    },
  };
};

const bodyText = (): string => document.body.textContent ?? "";

test("loaded イベントで recent に追加され broken-link 件数の warning が出る", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value);
  const tasks = [makeTask({ filePath: "/a.md", links: ["/missing.md"] })];
  act(() => {
    harness.emit({ type: "loaded", path: "/proj", data: dataOf(tasks) });
  });
  expect(probe.recentPaths).toEqual(["/proj"]);
  expect(bodyText()).toContain("リンク切れが 1 件あります");
});

test("loaded イベントで parse-error 件数の warning が出る", () => {
  const harness = createEventsHarness();
  setup(harness.value);
  const tasks = [
    makeTask({
      warnings: [{ code: "invalidStatusUsedDefault", message: "x" }],
    }),
  ];
  act(() => {
    harness.emit({ type: "loaded", path: "/proj", data: dataOf(tasks) });
  });
  expect(bodyText()).toContain("パースエラーが 1 件あります");
});

test("broken-link / parse-error が 0 件の loaded では warning が出ず recent 追加のみ", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value);
  act(() => {
    harness.emit({
      type: "loaded",
      path: "/proj",
      data: dataOf([makeTask()]),
    });
  });
  expect(probe.recentPaths).toEqual(["/proj"]);
  expect(bodyText()).not.toContain("リンク切れ");
  expect(bodyText()).not.toContain("パースエラー");
});

test("open-error イベントで projectErrorMessage の error トーストが出る", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value);
  act(() => {
    harness.emit({
      type: "open-error",
      error: {
        kind: "tauri",
        error: new TauriError(
          "UNKNOWN",
          "開けませんでした",
          undefined,
          "open_project",
        ),
      },
    });
  });
  expect(bodyText()).toContain("開けませんでした");
  // open 失敗は recent に追加しない。
  expect(probe.recentPaths).toEqual([]);
});

test("wasNotifiedByInvokeWrapped が true の open-error では toast を出さない", () => {
  const harness = createEventsHarness();
  setup(harness.value);
  act(() => {
    harness.emit({
      type: "open-error",
      error: {
        kind: "tauri",
        error: new TauriError("UNKNOWN", "抑止対象", undefined, "create_task"),
      },
    });
  });
  expect(bodyText()).not.toContain("抑止対象");
});

test("project 切替で loaded が再 emit されると別 path が recent に追加される", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value);
  act(() => {
    harness.emit({ type: "loaded", path: "/a", data: dataOf([makeTask()]) });
  });
  act(() => {
    harness.emit({ type: "loaded", path: "/b", data: dataOf([makeTask()]) });
  });
  expect(probe.recentPaths).toEqual(["/b", "/a"]);
});

test("StrictMode 下でも loaded 1 回につき add は 1 回だけ（購読の対称性）", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value, true);
  act(() => {
    harness.emit({ type: "loaded", path: "/proj", data: dataOf([makeTask()]) });
  });
  expect(probe.recentPaths).toEqual(["/proj"]);
});

test("unmount 後は購読が解除されイベントを受け取らない", () => {
  const harness = createEventsHarness();
  setup(harness.value);
  expect(harness.listenerCount()).toBe(1);
  act(() => {
    root?.unmount();
  });
  root = null;
  expect(harness.listenerCount()).toBe(0);
});

// ───────── watcher diagnostics ─────────

test("watcher-diagnostic（resourceExhausted）で error トーストが 1 回出る", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value);

  act(() => {
    harness.emit({
      type: "watcher-diagnostic",
      code: "resourceExhausted",
      message: "inotify watch limit reached",
      changeId: "1-1",
    });
  });

  expect(bodyText()).toContain(watcherDiagnosticMessage("resourceExhausted"));
  // 監視障害は project を開いた事実ではないので recent には積まない。
  expect(probe.recentPaths).toEqual([]);
});

test("rescanFailed は再読み込み失敗の文言で通知される", () => {
  const harness = createEventsHarness();
  setup(harness.value);

  act(() => {
    harness.emit({
      type: "watcher-diagnostic",
      code: "rescanFailed",
      message: "scan failed",
      changeId: "1-2",
    });
  });

  expect(bodyText()).toContain(watcherDiagnosticMessage("rescanFailed"));
});

test("diagnostic を 2 回 emit しても Provider は state を持たない", () => {
  const harness = createEventsHarness();
  const probe = setup(harness.value);

  act(() => {
    harness.emit({
      type: "watcher-diagnostic",
      code: "io",
      message: "boom",
      changeId: "1-3",
    });
    harness.emit({
      type: "watcher-diagnostic",
      code: "io",
      message: "boom",
      changeId: "1-4",
    });
  });

  expect(probe.recentPaths).toEqual([]);
  expect(bodyText()).toContain(watcherDiagnosticMessage("io"));
});
