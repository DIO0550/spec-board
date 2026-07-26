import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardProgress } from "..";

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

const baseValue = (
  overrides: Partial<TaskCardContextValue> = {},
): TaskCardContextValue => ({
  task: createTask(),
  doneColumn: "Done",
  milestonesByName: undefined,
  hasBrokenLink: false,
  hasParseError: false,
  subIssueCounts: { done: 0, total: 0 },
  childRows: [],
  ...overrides,
});

const renderWithValue = (value: TaskCardContextValue, children: ReactNode) => {
  act(() => {
    root?.render(createElement(TaskCardContext.Provider, { value }, children));
  });
};

test("Provider の total=0 なら SubIssueProgress 自体は null", () => {
  renderWithValue(
    baseValue({ subIssueCounts: { done: 0, total: 0 } }),
    createElement(TaskCardProgress),
  );
  expect(container?.querySelector("[role='progressbar']")).toBeNull();
});

test("Provider の subIssueCounts={done:1,total:3} で進捗バーが 33% 表示", () => {
  renderWithValue(
    baseValue({
      subIssueCounts: { done: 1, total: 3 },
      childRows: [{ key: "c1", label: "子1", isDone: false }],
    }),
    createElement(TaskCardProgress),
  );
  const bar = container?.querySelector("[role='progressbar']");
  expect(bar?.getAttribute("aria-valuenow")).toBe("33");
});

test("Provider の projection をそのまま流し、FE 側で再集計しない", () => {
  // override 経路は廃止済み。context の subIssueCounts が唯一の真実源であることを固定する。
  renderWithValue(
    baseValue({
      subIssueCounts: { done: 1, total: 2 },
      childRows: [
        { key: "c1", label: "子1", isDone: true },
        { key: "c2", label: "子2", isDone: false },
        { key: "c3", label: "子3", isDone: false },
      ],
    }),
    createElement(TaskCardProgress),
  );
  const bar = container?.querySelector("[role='progressbar']");
  // childRows は 3 件だが counts は 1/2 なので 50%。行数から再集計していない証拠。
  expect(bar?.getAttribute("aria-valuenow")).toBe("50");
  expect(container?.querySelectorAll("details ul li").length).toBe(3);
});

test("Provider の subIssueCounts={done:2,total:4} がそのまま反映される", () => {
  renderWithValue(
    baseValue({
      subIssueCounts: { done: 2, total: 4 },
      childRows: [{ key: "c1", label: "子1", isDone: false }],
    }),
    createElement(TaskCardProgress),
  );
  const bar = container?.querySelector("[role='progressbar']");
  expect(bar?.getAttribute("aria-valuenow")).toBe("50");
});
