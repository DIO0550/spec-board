import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskForest } from "@/domains/task-forest";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { TreeView } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

const createTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: "task",
    title: "タスク",
    status: "Todo",
    priority: "Medium",
    labels: ["frontend"],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/task.md",
    ...overrides,
  });

const parent = createTask({
  id: "parent",
  title: "親",
  children: ["tasks/child.md"],
  filePath: "tasks/parent.md",
});
const child = createTask({
  id: "child",
  title: "子",
  parent: parent.filePath,
  filePath: "tasks/child.md",
});
const done = createTask({
  id: "done",
  title: "完了",
  status: "Done",
  filePath: "tasks/done.md",
});
const columns: Column[] = [
  { name: "Todo", order: 0, color: "#64748b" },
  { name: "Done", order: 1, color: "#16a34a" },
];

const render = () => {
  act(() => {
    root?.render(
      createElement(TreeView, {
        tasks: [parent, child, done],
        taskTree: TaskForest.fromPayload([
          {
            filePath: parent.filePath,
            children: [{ filePath: child.filePath, children: [] }],
          },
          { filePath: done.filePath, children: [] },
        ]),
        columns,
        projectName: "payments-service",
        doneColumn: "Done",
        onTaskClick: vi.fn(),
      }),
    );
  });
};

const click = (element: Element | null) => {
  act(() => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

test("toolbarとstatus sectionと6列headerを描画する", () => {
  render();

  expect(
    container?.querySelector("[data-tree-toolbar]")?.textContent,
  ).toContain("payments-service");
  expect(container?.querySelectorAll("[data-tree-section]")).toHaveLength(2);
  expect(container?.querySelector("[data-tree-columns]")?.className).toContain(
    "grid-cols-[minmax(280px,1.7fr)_120px_28px_200px_100px_1fr]",
  );
});

test("toolbarですべて折畳とすべて展開を操作できる", () => {
  render();
  expect(container?.textContent).toContain("子");

  click(container?.querySelector('[data-tree-action="collapse-all"]') ?? null);
  expect(container?.textContent).not.toContain("子");

  click(container?.querySelector('[data-tree-action="expand-all"]') ?? null);
  expect(container?.textContent).toContain("子");
});

test("rowにstatus priority labels progress fileを表示する", () => {
  render();
  const row = container?.querySelector('[data-tree-row="parent"]');

  expect(row?.textContent).toContain("Todo");
  expect(row?.textContent).toContain("Medium");
  expect(row?.textContent).toContain("frontend");
  expect(row?.textContent).toContain("0/1");
  expect(row?.textContent).toContain("tasks/parent.md");
});

test("done rowと深い子rowに完了・indent guide表現を付ける", () => {
  render();

  expect(
    container?.querySelector('[data-tree-row="done"]')?.className,
  ).toContain("line-through");
  expect(
    container?.querySelector('[data-tree-row="child"]')?.className,
  ).toContain("border-l");
});
