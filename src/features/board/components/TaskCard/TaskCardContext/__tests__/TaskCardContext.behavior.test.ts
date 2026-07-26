import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  TaskCardContext,
  type TaskCardContextValue,
  useTaskCardContext,
} from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テスト",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

const Probe = () => {
  const ctx = useTaskCardContext();
  return createElement("span", { "data-testid": "probe" }, ctx.task.id);
};

test("useTaskCardContext を Provider 外で呼ぶと throw する", () => {
  // React は子レンダー中の throw を console.error に出力するため、テストログを汚さないよう抑止する。
  // afterEach の vi.restoreAllMocks() で自動復元されるため、モジュール変数は持たない。
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    act(() => {
      root?.render(createElement(Probe));
    });
  }).toThrow(/TaskCard\.\* は <TaskCard\.Root>/);
});

test("Provider 内で useTaskCardContext は Value を返す", () => {
  const value: TaskCardContextValue = {
    task: createTask({ id: "task-42" }),
    doneColumn: "Done",
    milestonesByName: undefined,
    hasBrokenLink: false,
    hasParseError: false,
    subIssueCounts: { done: 0, total: 0 },
    childRows: [],
  };
  act(() => {
    root?.render(
      createElement(TaskCardContext.Provider, { value }, createElement(Probe)),
    );
  });
  const probe = container?.querySelector('[data-testid="probe"]');
  expect(probe?.textContent).toBe("task-42");
});
