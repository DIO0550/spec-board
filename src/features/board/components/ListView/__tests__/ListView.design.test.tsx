import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { ListView } from "..";

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
    due: "2026-09-30",
    labels: ["frontend"],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/task.md",
    ...overrides,
  });

const columns: Column[] = [
  { name: "Todo", order: 0, color: "#64748b" },
  { name: "Done", order: 1, color: "#16a34a" },
];

const render = (tasks: Task[], filterActive = false) => {
  act(() => {
    root?.render(
      createElement(ListView, {
        tasks,
        filterActive,
        columns,
        doneColumn: "Done",
        onTaskClick: vi.fn(),
        onAddTask: vi.fn(),
      }),
    );
  });
};

test("有効な絞り込みで0件の場合はno-results状態を描画する", () => {
  render([], true);

  expect(container?.querySelector("[data-list-no-results]")?.textContent).toBe(
    "条件に一致するタスクがありません",
  );
});

const click = (element: Element | null | undefined) => {
  act(() => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

test("status順のgroup headerと空groupを描画する", () => {
  render([createTask({ id: "todo", title: "Todo task" })]);

  const groups = container?.querySelectorAll("[data-list-group]");
  expect(groups).toHaveLength(2);
  expect(groups?.[0].textContent).toContain("Todo");
  expect(groups?.[0].textContent).toContain("1");
  expect(groups?.[1].textContent).toContain("Done");
  expect(groups?.[1].textContent).toContain("タスクなし");
});

test("table headerとrowが指定8列gridを共有し横scrollを許可する", () => {
  render([createTask({ id: "todo" })]);

  expect(container?.querySelector("[data-list-scroll]")?.className).toContain(
    "overflow-x-auto",
  );
  expect(container?.querySelector("[data-list-header]")?.className).toContain(
    "grid-cols-[28px_96px_28px_minmax(220px,1fr)_220px_140px_140px_96px]",
  );
  expect(container?.querySelector("[data-list-row]")?.className).toContain(
    "grid-cols-[28px_96px_28px_minmax(220px,1fr)_220px_140px_140px_96px]",
  );
});

test("title header clickで昇順から降順へ並べ替えactive arrowを更新する", () => {
  render([
    createTask({ id: "a", title: "Alpha", filePath: "tasks/a.md" }),
    createTask({ id: "z", title: "Zulu", filePath: "tasks/z.md" }),
  ]);

  const titleSort = container?.querySelector('[data-sort-key="title"]');
  expect(titleSort?.getAttribute("aria-label")).toContain("ascending");
  click(titleSort);

  expect(titleSort?.getAttribute("aria-label")).toContain("descending");
  const titles = Array.from(
    container?.querySelectorAll("[data-list-row-title]") ?? [],
  ).map((element) => element.textContent);
  expect(titles).toEqual(["Zulu", "Alpha"]);
});

test("done rowは完了状態を視覚的に伝える", () => {
  render([
    createTask({
      id: "done",
      title: "完了",
      status: "Done",
      filePath: "tasks/done.md",
    }),
  ]);

  expect(container?.querySelector("[data-list-row]")?.className).toContain(
    "line-through",
  );
});
