import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload, type TaskWarning } from "@/types/task";
import { Column } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const invalidWarning: TaskWarning = {
  code: "invalidStatusUsedDefault",
  field: "status",
  message: "invalid status, used default",
};
const cycleWarning: TaskWarning = {
  code: "parentCycle",
  field: "parent",
  message: "parent chain forms a cycle",
};

function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

function render(props: Parameters<typeof Column>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Column, props));
  });
}

test("invalid warning を持つ task を渡すとカードに parse-error-icon が表示される", () => {
  const task = createTask({ warnings: [invalidWarning] });
  render({ name: "Todo", tasks: [task], onAddClick: vi.fn() });
  expect(
    document.querySelector('[data-testid="parse-error-icon"]'),
  ).not.toBeNull();
});

test("除外コード（parentCycle）のみの task では parse-error-icon は描画されない", () => {
  const task = createTask({ warnings: [cycleWarning] });
  render({ name: "Todo", tasks: [task], onAddClick: vi.fn() });
  expect(document.querySelector('[data-testid="parse-error-icon"]')).toBeNull();
});

test("warnings 空の task では parse-error-icon は描画されない", () => {
  const task = createTask({ warnings: [] });
  render({ name: "Todo", tasks: [task], onAddClick: vi.fn() });
  expect(document.querySelector('[data-testid="parse-error-icon"]')).toBeNull();
});
