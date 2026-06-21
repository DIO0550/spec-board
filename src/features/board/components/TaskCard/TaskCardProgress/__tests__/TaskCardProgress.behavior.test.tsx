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
  childTasks: [],
  ...overrides,
});

const renderWithValue = (value: TaskCardContextValue, children: ReactNode) => {
  act(() => {
    root?.render(createElement(TaskCardContext.Provider, { value }, children));
  });
};

test("childTasks 未指定 / Provider が total=0 → SubIssueProgress 自体は null", () => {
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
      childTasks: [createTask({ id: "c1" })],
    }),
    createElement(TaskCardProgress),
  );
  const bar = container?.querySelector("[role='progressbar']");
  expect(bar?.getAttribute("aria-valuenow")).toBe("33");
});

test("props.childTasks override 時は done/total も再集計（Provider の subIssueCounts は使わない）", () => {
  const overrideChildren = [
    createTask({ id: "c1", status: "Done" }),
    createTask({ id: "c2", status: "Todo" }),
  ];
  renderWithValue(
    baseValue({
      subIssueCounts: { done: 99, total: 99 },
      childTasks: [],
    }),
    <TaskCardProgress childTasks={overrideChildren} />,
  );
  const bar = container?.querySelector("[role='progressbar']");
  expect(bar?.getAttribute("aria-valuenow")).toBe("50");
});

test("props.childTasks 未指定なら Provider の subIssueCounts={done:2,total:4} がそのまま反映される", () => {
  // override 経路を踏まないことは aria-valuenow=50% (=2/4) で観察可能。
  // Provider の {done:2,total:4} を再計算なしに使えば 50% になる。再計算が起きると
  // Provider 値（done:2,total:4）でなく override 計算結果が出るため値が変わる。
  renderWithValue(
    baseValue({
      subIssueCounts: { done: 2, total: 4 },
      childTasks: [createTask({ id: "c1" })],
    }),
    createElement(TaskCardProgress),
  );
  const bar = container?.querySelector("[role='progressbar']");
  expect(bar?.getAttribute("aria-valuenow")).toBe("50");
});
