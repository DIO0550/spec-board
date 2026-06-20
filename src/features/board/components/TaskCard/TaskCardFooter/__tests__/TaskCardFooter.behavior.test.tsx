import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardFooter } from "..";

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
  descendantTasks: [],
  ...overrides,
});

const renderWithValue = (value: TaskCardContextValue, children: ReactNode) => {
  act(() => {
    root?.render(createElement(TaskCardContext.Provider, { value }, children));
  });
};

test("task.id がフッターに表示される", () => {
  renderWithValue(
    baseValue({ task: createTask({ id: "task-99" }) }),
    createElement(TaskCardFooter),
  );
  const id = container?.querySelector('[data-testid="task-card-id"]');
  expect(id?.textContent).toBe("task-99");
});

test("linkCount=2 で 🔗 2 が表示される", () => {
  renderWithValue(
    baseValue({
      task: createTask({ links: ["tasks/a.md", "tasks/b.md"] }),
    }),
    createElement(TaskCardFooter),
  );
  const linkCount = container?.querySelector(
    '[data-testid="task-card-link-count"]',
  );
  expect(linkCount?.textContent).toContain("2");
});

test("linkCount=0 で link-count 要素が出ない", () => {
  renderWithValue(
    baseValue({ task: createTask({ links: [] }) }),
    createElement(TaskCardFooter),
  );
  expect(
    container?.querySelector('[data-testid="task-card-link-count"]'),
  ).toBeNull();
});

test("subIssueCounts={done:1,total:2} で 1/2 表示", () => {
  renderWithValue(
    baseValue({ subIssueCounts: { done: 1, total: 2 } }),
    createElement(TaskCardFooter),
  );
  const count = container?.querySelector(
    '[data-testid="task-card-subissue-count"]',
  );
  expect(count?.textContent).toBe("1/2");
});

test("subIssueCounts={done:0,total:0} で subissue-count 要素が出ない", () => {
  renderWithValue(
    baseValue({ subIssueCounts: { done: 0, total: 0 } }),
    createElement(TaskCardFooter),
  );
  expect(
    container?.querySelector('[data-testid="task-card-subissue-count"]'),
  ).toBeNull();
});
