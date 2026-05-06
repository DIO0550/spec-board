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
