import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
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

test("カラム名がヘッダーに表示される", async () => {
  render({ name: "In Progress", tasks: [], onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("In Progress");
  });
});

test("タスク件数がヘッダーに表示される", async () => {
  const tasks = [
    createTask({ id: "task-1", title: "タスク1" }),
    createTask({ id: "task-2", title: "タスク2" }),
  ];
  render({ name: "Todo", tasks, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("2");
  });
});

test("タスクのタイトルが表示される", async () => {
  const tasks = [createTask({ title: "ログイン修正" })];
  render({ name: "Todo", tasks, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("ログイン修正");
  });
});

test("「+ 追加」ボタンが表示される", async () => {
  render({ name: "Todo", tasks: [], onAddClick: vi.fn() });
  await vi.waitFor(() => {
    const btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "+ 追加",
    );
    expect(btn).toBeDefined();
  });
});

test("aria-label にカラム名が設定される", async () => {
  render({ name: "Done", tasks: [], onAddClick: vi.fn() });
  await vi.waitFor(() => {
    const section = container?.querySelector("section");
    expect(section?.getAttribute("aria-label")).toBe("Done");
  });
});

test("3 階層 fixture（root + 子 1 + 孫 2 のうち done 1）で TaskCard サマリが 1/3 になる", async () => {
  const grand1 = createTask({
    id: "g1",
    title: "孫1",
    status: "Done",
    filePath: "tasks/g1.md",
  });
  const grand2 = createTask({
    id: "g2",
    title: "孫2",
    status: "Todo",
    filePath: "tasks/g2.md",
  });
  const child = createTask({
    id: "c1",
    title: "子1",
    status: "Todo",
    filePath: "tasks/c1.md",
    children: ["tasks/g1.md", "tasks/g2.md"],
  });
  const root = createTask({
    id: "root",
    title: "親",
    status: "Todo",
    filePath: "tasks/root.md",
    children: ["tasks/c1.md"],
  });
  const allTasks = [root, child, grand1, grand2];

  render({
    name: "Todo",
    tasks: [root],
    allTasks,
    doneColumn: "Done",
    onAddClick: vi.fn(),
  });

  await vi.waitFor(() => {
    const bar = container?.querySelector(
      "[role='progressbar']",
    ) as HTMLElement | null;
    expect(bar?.getAttribute("aria-valuenow")).toBe("33");
    expect(container?.textContent).toContain("1/3");
  });
});
