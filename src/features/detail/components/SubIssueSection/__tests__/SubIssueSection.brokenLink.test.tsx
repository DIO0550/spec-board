import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { buildChildRowList, SubIssueSection } from "..";

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
    id: "t",
    title: "タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/t.md",
    ...overrides,
  });

const render = (props: Parameters<typeof SubIssueSection>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SubIssueSection, props));
  });
};

test("`childFilePaths` の順序通りに描画される (解決済 → ボタン行 / 未解決 → broken 行)", () => {
  const c1 = makeTask({ id: "c1", title: "子1", filePath: "tasks/c1.md" });
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c1.md", "tasks/dead.md"],
  });
  render({
    parentTask: parent,
    childTasks: [c1],
    subIssueCounts: { done: 0, total: 1 },
    isDone: () => false,
    onAddSubIssue: vi.fn(),
    brokenChildPaths: new Set(["tasks/dead.md"]),
  });
  const items = document.querySelectorAll(
    '[data-testid^="sub-issue-item-"], [data-testid^="sub-issue-broken-"]',
  );
  expect(items.length).toBe(2);
  expect(items[0].getAttribute("data-testid")).toBe("sub-issue-item-c1");
  expect(items[1].getAttribute("data-testid")).toBe("sub-issue-broken-0");
  expect(items[1].getAttribute("data-path")).toBe("tasks/dead.md");
});

test("正常な child は従来通りボタン行が描画される", () => {
  const c1 = makeTask({ id: "c1", title: "子1", filePath: "tasks/c1.md" });
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c1.md"],
  });
  render({
    parentTask: parent,
    childTasks: [c1],
    subIssueCounts: { done: 0, total: 1 },
    isDone: () => false,
    onAddSubIssue: vi.fn(),
    onChildClick: vi.fn(),
    brokenChildPaths: new Set(),
  });
  const button = document.querySelector(
    '[data-testid="sub-issue-item-c1"]',
  ) as HTMLButtonElement;
  expect(button).not.toBeNull();
  expect(button.disabled).toBe(false);
});

test("`brokenChildPaths` が empty なら従来挙動と同一", () => {
  const c1 = makeTask({ id: "c1", title: "子1", filePath: "tasks/c1.md" });
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c1.md"],
  });
  render({
    parentTask: parent,
    childTasks: [c1],
    subIssueCounts: { done: 0, total: 1 },
    isDone: () => false,
    onAddSubIssue: vi.fn(),
  });
  expect(
    document.querySelectorAll('[data-testid^="sub-issue-broken-"]').length,
  ).toBe(0);
  expect(
    document.querySelector('[data-testid="sub-issue-item-c1"]'),
  ).not.toBeNull();
});

test("`childTasks.length === 0` でも `brokenChildPaths.size > 0` なら broken 行が出る", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/dead.md"],
  });
  render({
    parentTask: parent,
    childTasks: [],
    subIssueCounts: { done: 0, total: 0 },
    isDone: () => false,
    onAddSubIssue: vi.fn(),
    brokenChildPaths: new Set(["tasks/dead.md"]),
  });
  const row = document.querySelector('[data-testid="sub-issue-broken-0"]');
  expect(row).not.toBeNull();
  expect(row?.getAttribute("data-path")).toBe("tasks/dead.md");
});

test("broken 行に WarningIcon と取消線 path が描画される", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/dead.md"],
  });
  render({
    parentTask: parent,
    childTasks: [],
    subIssueCounts: { done: 0, total: 0 },
    isDone: () => false,
    onAddSubIssue: vi.fn(),
    brokenChildPaths: new Set(["tasks/dead.md"]),
  });
  const row = document.querySelector('[data-testid="sub-issue-broken-0"]');
  expect(row?.getAttribute("data-path")).toBe("tasks/dead.md");
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
  expect(row?.querySelector(".line-through")?.textContent).toBe(
    "tasks/dead.md",
  );
  expect(row?.textContent).toContain("リンク切れ");
});

test("buildChildRowList: 解決済タスクは resolved、broken set 一致は broken、それ以外はスキップ", () => {
  const c1 = makeTask({ id: "c1", filePath: "tasks/c1.md" });
  const rows = buildChildRowList(
    ["tasks/c1.md", "tasks/dead.md", "tasks/unknown.md"],
    [c1],
    new Set(["tasks/dead.md"]),
  );
  expect(rows.length).toBe(2);
  expect(rows[0]).toEqual({ kind: "resolved", task: c1 });
  expect(rows[1]).toEqual({
    kind: "broken",
    rawPath: "tasks/dead.md",
    brokenIndex: 0,
  });
});
