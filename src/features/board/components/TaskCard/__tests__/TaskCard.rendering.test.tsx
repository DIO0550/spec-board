import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { TaskCard } from "..";

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

function render(props: Omit<Parameters<typeof TaskCard>[0], "fromColumn">) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskCard, { fromColumn: "Todo", ...props }));
  });
}

test("タイトルが表示される", async () => {
  render({ task: createTask({ title: "ログイン修正" }), onClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("ログイン修正");
  });
});

test("カードクリックでonClickが呼ばれる", async () => {
  const onClick = vi.fn();
  render({ task: createTask({ id: "task-42" }), onClick });
  await vi.waitFor(() => {
    expect(container?.querySelector('[role="button"]')).toBeTruthy();
  });
  const card = container?.querySelector('[role="button"]') as HTMLElement;
  card.click();
  expect(onClick).toHaveBeenCalledWith("task-42");
});

test("onClick未指定の場合、divで描画されボタンにならない", async () => {
  render({ task: createTask({ title: "非インタラクティブ" }) });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("非インタラクティブ");
  });
  const button = container?.querySelector("button");
  expect(button).toBeNull();
  const div = container?.querySelector("div");
  expect(div).toBeTruthy();
});

test("titleが未設定の場合、filePathが表示される", async () => {
  render({
    task: createTask({ title: "", filePath: "tasks/my-task.md" }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("tasks/my-task.md");
  });
});

test("priority が High の場合、赤いバッジが表示される", async () => {
  render({ task: createTask({ priority: "High" }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const badge = container?.querySelector("span.bg-red-100");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("High");
  });
});

test("labels が ['bug', 'frontend'] の場合、2つのタグが表示される", async () => {
  render({
    task: createTask({ labels: ["bug", "frontend"] }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const tags = container?.querySelectorAll('[data-testid="label-tag"]');
    expect(tags?.length).toBe(2);
    expect(tags?.[0]?.textContent).toBe("bug");
    expect(tags?.[1]?.textContent).toBe("frontend");
  });
});

test("priority 未設定でバッジ非表示", async () => {
  render({ task: createTask({ priority: undefined }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const badge = container?.querySelector(
      ".bg-red-100, .bg-yellow-100, .bg-blue-100",
    );
    expect(badge).toBeNull();
  });
});

test("labels が空配列でタグ領域非表示", async () => {
  render({ task: createTask({ labels: [] }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const tagContainer = container?.querySelector(".flex-wrap");
    expect(tagContainer).toBeNull();
  });
});

test("ラベルが5個以上で折り返し表示", async () => {
  render({
    task: createTask({
      labels: ["bug", "frontend", "urgent", "design", "refactor"],
    }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const tags = container?.querySelectorAll('[data-testid="label-tag"]');
    expect(tags?.length).toBe(5);
    const wrapper = container?.querySelector(".flex-wrap");
    expect(wrapper).toBeTruthy();
  });
});

test("descendantTasks ベースで進捗サマリが表示される（直下子 2 + 孫 3 で 3/5）", async () => {
  const childTasks = [
    createTask({ id: "c1", status: "Todo" }),
    createTask({ id: "c2", status: "Done" }),
  ];
  const descendantTasks = [
    createTask({ id: "c1", status: "Todo" }),
    createTask({ id: "c2", status: "Done" }),
    createTask({ id: "g1", status: "Done" }),
    createTask({ id: "g2", status: "Done" }),
    createTask({ id: "g3", status: "Todo" }),
  ];
  render({
    task: createTask({
      id: "parent",
      title: "親",
      children: ["tasks/c1.md", "tasks/c2.md"],
    }),
    childTasks,
    descendantTasks,
    doneColumn: "Done",
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const bar = container?.querySelector(
      "[role='progressbar']",
    ) as HTMLElement | null;
    expect(bar?.getAttribute("aria-valuenow")).toBe("60");
    expect(container?.textContent).toContain("3/5");
  });
});
