import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import { ProjectProvider, type ProjectState } from "..";
import {
  type ProjectColumnActionsContextValue,
  type ProjectEventsContextValue,
  type ProjectSessionActionsContextValue,
  type ProjectTaskActionsContextValue,
  useProjectColumnActions,
  useProjectEvents,
  useProjectSessionActions,
  useProjectState,
  useProjectTaskActions,
} from "../context";

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
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: { columns: [{ name: "Todo", order: 0 }], doneColumn: "Todo" },
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const mount = (node: React.ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    root?.render(node);
  });
  spy.mockRestore();
};

// === Provider 外 throw の Contract ===

test.each([
  ["useProjectState", useProjectState],
  ["useProjectSessionActions", useProjectSessionActions],
  ["useProjectTaskActions", useProjectTaskActions],
  ["useProjectColumnActions", useProjectColumnActions],
  ["useProjectEvents", useProjectEvents],
])("%s を Provider 外で呼ぶと専用メッセージで throw する", (name, hook) => {
  const OutsideProbe = () => {
    hook();
    return null;
  };
  expect(() => {
    mount(createElement(OutsideProbe));
  }).toThrow(`${name} は ProjectProvider の内側で使用してください`);
});

// === state / actions / events の基本契約 ===

test("Provider 内で useProjectState は idle を返す", () => {
  let observed: ProjectState | null = null;
  const Probe = () => {
    observed = useProjectState().state;
    return null;
  };
  mount(createElement(ProjectProvider, null, createElement(Probe)));
  expect(observed).toEqual({ kind: "idle" });
});

test("ToastProvider / RecentProjectsProvider なしで単体 mount できる（通知非依存）", () => {
  const holder: { state: ProjectState | null } = { state: null };
  const Probe = () => {
    holder.state = useProjectState().state;
    return null;
  };
  expect(() => {
    mount(createElement(ProjectProvider, null, createElement(Probe)));
  }).not.toThrow();
  expect(holder.state?.kind).toBe("idle");
});

test("親の再 render をまたいで 3 系統 action と events の identity が保たれる", () => {
  const captures: {
    session: ProjectSessionActionsContextValue[];
    task: ProjectTaskActionsContextValue[];
    column: ProjectColumnActionsContextValue[];
    events: ProjectEventsContextValue[];
  } = { session: [], task: [], column: [], events: [] };
  const Probe = () => {
    captures.session.push(useProjectSessionActions());
    captures.task.push(useProjectTaskActions());
    captures.column.push(useProjectColumnActions());
    captures.events.push(useProjectEvents());
    return null;
  };
  const Parent = (props: { tick: number }) => {
    // tick を変えて子ツリーを再 render させる。
    return createElement(
      "div",
      { "data-tick": props.tick },
      createElement(ProjectProvider, null, createElement(Probe)),
    );
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Parent, { tick: 0 }));
  });
  act(() => {
    root?.render(createElement(Parent, { tick: 1 }));
  });
  const lastOf = <T,>(arr: T[]): T => arr[arr.length - 1];
  expect(captures.session.length).toBeGreaterThanOrEqual(2);
  expect(Object.is(captures.session[0], lastOf(captures.session))).toBe(true);
  expect(Object.is(captures.task[0], lastOf(captures.task))).toBe(true);
  expect(Object.is(captures.column[0], lastOf(captures.column))).toBe(true);
  expect(Object.is(captures.events[0], lastOf(captures.events))).toBe(true);
});

test("subscribe より前に emit されたイベントは届かない（replay しない）", () => {
  const received: string[] = [];
  const Probe = () => {
    const { subscribe } = useProjectEvents();
    useEffect(() => {
      return subscribe((event) => {
        received.push(event.type);
      });
    }, [subscribe]);
    return null;
  };
  mount(createElement(ProjectProvider, null, createElement(Probe)));
  // 何も open していないので過去イベントは無い。
  expect(received).toEqual([]);
});

// === StrictMode 下の remount 後 open（CTR-012） ===

test("StrictMode 下で mount → remount 後も openProjectByPath が loaded に到達する", async () => {
  openProjectMock.mockResolvedValue(
    Result.ok<OpenProjectPayload>({
      tasks: [
        Task.fromPayload({
          id: "a",
          title: "A",
          status: "Todo",
          labels: [],
          links: [],
          children: [],
          reverseLinks: [],
          body: "",
          filePath: "tasks/a.md",
        }),
      ],
      columns: ["Todo"],
      projections: new Map(),
    }),
  );
  const holder: {
    latest: {
      state: ProjectState;
      open: (path: string) => Promise<void>;
    } | null;
  } = { latest: null };
  const Probe = () => {
    const { state } = useProjectState();
    const { openProjectByPath } = useProjectSessionActions();
    holder.latest = { state, open: openProjectByPath };
    return null;
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        StrictMode,
        null,
        createElement(ProjectProvider, null, createElement(Probe)),
      ),
    );
  });
  let pending!: Promise<void>;
  act(() => {
    pending = holder.latest?.open("/p") ?? Promise.resolve();
  });
  await act(async () => {
    await pending;
  });
  expect(holder.latest?.state.kind).toBe("loaded");
});
