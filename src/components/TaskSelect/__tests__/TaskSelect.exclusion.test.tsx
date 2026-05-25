import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { TaskSelect } from "..";

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

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "t-1",
    title: "候補",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/candidate.md",
    ...overrides,
  });

const TASKS: Task[] = [
  makeTask({ id: "t-1", title: "A", filePath: "tasks/a.md" }),
  makeTask({ id: "t-2", title: "B", filePath: "tasks/b.md" }),
  makeTask({ id: "t-3", title: "C", filePath: "tasks/c.md" }),
];

const render = (props: Parameters<typeof TaskSelect>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskSelect, props));
  });
};

test("excludeFilePaths に含まれる task は候補一覧から除外される", () => {
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    excludeFilePaths: ["tasks/b.md"],
    autoFocus: true,
  });

  expect(
    document.querySelector('[data-testid="task-select-option-t-1"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-select-option-t-2"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-testid="task-select-option-t-3"]'),
  ).toBeTruthy();
});

test("excludeFilePaths で全件除外されると empty 表示になる", () => {
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    excludeFilePaths: ["tasks/a.md", "tasks/b.md", "tasks/c.md"],
    autoFocus: true,
  });

  expect(
    document.querySelector('[data-testid="task-select-empty"]'),
  ).toBeTruthy();
});
