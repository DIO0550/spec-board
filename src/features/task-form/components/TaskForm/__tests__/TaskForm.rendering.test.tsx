import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column, Task } from "@/types/task";
import { TaskForm } from "..";

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

const COLUMNS: Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

const PARENT_CANDIDATES: Task[] = [
  {
    id: "p-1",
    title: "親タスクA",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/parent-a.md",
  },
];

const render = (props: Parameters<typeof TaskForm>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskForm, props));
  });
};

test("全フィールドが表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="task-form-title"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-status"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-priority"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-label-input"]'),
  ).toBeTruthy();
  expect(document.querySelector('[data-testid="task-form-body"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-cancel"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-submit"]'),
  ).toBeTruthy();
});

test("parentCandidates 未指定なら親タスクフィールドは表示されない", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="parent-task-select"]'),
  ).toBeNull();
});

test("parentCandidates 指定で親タスク選択 UI が表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    parentCandidates: PARENT_CANDIDATES,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="parent-task-select"]'),
  ).toBeTruthy();
});
