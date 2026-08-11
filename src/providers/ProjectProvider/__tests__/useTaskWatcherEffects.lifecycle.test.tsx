import { listen as listenInvoke } from "@tauri-apps/api/event";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { watcherSessionFixture } from "@/domains/watcher-session/__tests__/fixture";
import type { ProjectState } from "../state/projectState";
import { useTaskWatcherEffects } from "../useTaskWatcherEffects";
import {
  WatcherGate,
  type WatcherGateRef,
  type WatcherResyncReason,
} from "../watcherEnvelopeGate";
import { watcherEnvelope } from "./watcherEnvelopeHarness";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const listenMock = vi.mocked(listenInvoke);

type Handler = (event: { payload: unknown }) => void;

const handlers: Record<string, Handler[]> = {};
const unlistens: Record<string, ReturnType<typeof vi.fn>[]> = {};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const session = watcherSessionFixture();

const loadedState: ProjectState = {
  kind: "loaded",
  path: "/p",
  data: {
    tasks: [],
    columns: [],
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
    openRequestId: 1,
    loadWarnings: [],
    watcherSession: session,
  },
};

/** hook を単独で駆動するテスト用コンポーネント。 */
const Harness = (props: {
  gate: WatcherGateRef;
  requestResync: (reason: WatcherResyncReason) => void;
  notifyDiagnostic: () => void;
  dispatch: () => void;
}) => {
  useTaskWatcherEffects({
    session,
    gate: props.gate,
    requestResync: props.requestResync,
    notifyDiagnostic: props.notifyDiagnostic,
    getState: () => loadedState,
    dispatch: props.dispatch,
  });
  return null;
};

beforeEach(() => {
  listenMock.mockReset();
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
  for (const key of Object.keys(unlistens)) {
    delete unlistens[key];
  }
  listenMock.mockImplementation(((name: string, handler: Handler) => {
    const unlisten = vi.fn();
    handlers[name] = [...(handlers[name] ?? []), handler];
    unlistens[name] = [...(unlistens[name] ?? []), unlisten];
    return Promise.resolve(unlisten);
  }) as unknown as typeof listenInvoke);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

/** 与えた callback で harness を描画する。 */
const render = (
  gate: WatcherGateRef,
  callbacks: {
    requestResync: (reason: WatcherResyncReason) => void;
    notifyDiagnostic: () => void;
    dispatch: () => void;
  },
) => {
  act(() => {
    root?.render(createElement(Harness, { gate, ...callbacks }));
  });
};

test("gate は session から初期化され、同じ generation の再描画では作り直されない", () => {
  const gate: WatcherGateRef = { current: WatcherGate.initial };
  const callbacks = {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  };
  render(gate, callbacks);
  const initialized = gate.current;

  render(gate, {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  });

  expect(initialized.session).toEqual(session);
  expect(gate.current).toBe(initialized);
});

test("callback の参照が変わっても resync 中の buffer とカウンタが保持される", () => {
  const gate: WatcherGateRef = { current: WatcherGate.initial };
  render(gate, {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  });
  // resync-required で resyncing に入れ、後続の envelope を buffer させる。
  act(() => {
    handlers["watcher-resync-required"]?.[0]?.({
      payload: watcherEnvelope({ reason: "rescan" }),
    });
  });
  act(() => {
    handlers["task-updated"]?.[0]?.({
      payload: watcherEnvelope({
        task: {
          id: "tasks/a.md",
          title: "A",
          status: "Todo",
          labels: [],
          links: [],
          children: [],
          reverseLinks: [],
          body: "",
          filePath: "tasks/a.md",
          extras: {},
          warnings: [],
        },
      }),
    });
  });
  const bufferedLength = gate.current.buffer.length;

  render(gate, {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  });

  expect(bufferedLength).toBe(1);
  expect(gate.current.buffer).toHaveLength(1);
  expect(gate.current.status).toBe("resyncing");
});

test("callback の参照が変わっても常設購読を張り替えない", async () => {
  const gate: WatcherGateRef = { current: WatcherGate.initial };
  render(gate, {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  });
  await act(async () => {});
  const firstUnlistens = [...(unlistens["task-updated"] ?? [])];

  render(gate, {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  });
  await act(async () => {});

  expect(listenMock).toHaveBeenCalledTimes(5);
  for (const unlisten of firstUnlistens) {
    expect(unlisten).not.toHaveBeenCalled();
  }
});

test("StrictModeのsetup-cleanup-remountで古い購読だけを解除する", async () => {
  const gate: WatcherGateRef = { current: WatcherGate.initial };
  const callbacks = {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  };
  act(() => {
    root?.render(
      createElement(
        StrictMode,
        null,
        createElement(Harness, { gate, ...callbacks }),
      ),
    );
  });
  await act(async () => {});

  expect(listenMock).toHaveBeenCalledTimes(10);
  for (const eventUnlistens of Object.values(unlistens)) {
    expect(eventUnlistens).toHaveLength(2);
    expect(eventUnlistens[0]).toHaveBeenCalledTimes(1);
    expect(eventUnlistens[1]).not.toHaveBeenCalled();
  }
});

test("unmount で 5 event 分の unlisten が呼ばれる", async () => {
  const gate: WatcherGateRef = { current: WatcherGate.initial };
  render(gate, {
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
    dispatch: vi.fn(),
  });
  await act(async () => {});
  const all = Object.values(unlistens).flat();

  await act(async () => {
    root?.unmount();
  });
  root = null;

  expect(all).toHaveLength(5);
  for (const unlisten of all) {
    expect(unlisten).toHaveBeenCalled();
  }
});
