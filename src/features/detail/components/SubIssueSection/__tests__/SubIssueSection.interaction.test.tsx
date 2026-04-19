import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "@/types/task";
import { SubIssueSection } from "..";

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

/**
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
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
  };
}

/**
 * SubIssueSection をレンダリングするヘルパー
 * @param props - SubIssueSection に渡す props
 */
function render(props: Parameters<typeof SubIssueSection>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SubIssueSection, props));
  });
}

const PARENT = makeTask({
  id: "p-1",
  title: "親タスク",
  filePath: "tasks/parent.md",
});

test("子タスクが空でも追加ボタンは表示される", () => {
  render({
    parentTask: PARENT,
    childTasks: [],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="sub-issue-add-button"]'),
  ).toBeTruthy();
  expect(document.querySelector('[role="progressbar"]')).toBeNull();
});

test("子タスクの進捗バーと完了/全数が表示される", () => {
  render({
    parentTask: PARENT,
    childTasks: [
      makeTask({ id: "c1", status: "Done" }),
      makeTask({ id: "c2", status: "Done" }),
      makeTask({ id: "c3", status: "Todo" }),
      makeTask({ id: "c4", status: "In Progress" }),
    ],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("50");
  expect(document.body.textContent).toContain("2/4");
});

test("「+ サブIssue 追加」ボタンで親のファイルパスが渡される", () => {
  const onAddSubIssue = vi.fn();
  render({
    parentTask: PARENT,
    childTasks: [],
    doneColumn: "Done",
    onAddSubIssue,
  });
  const button = document.querySelector(
    '[data-testid="sub-issue-add-button"]',
  ) as HTMLButtonElement;
  act(() => {
    button.click();
  });
  expect(onAddSubIssue).toHaveBeenCalledWith("tasks/parent.md");
});

test("子タスククリックで onChildClick が呼ばれる", () => {
  const onChildClick = vi.fn();
  render({
    parentTask: PARENT,
    childTasks: [makeTask({ id: "c1", title: "子1" })],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
    onChildClick,
  });
  const child = document.querySelector(
    '[data-testid="sub-issue-item-c1"]',
  ) as HTMLButtonElement;
  act(() => {
    child.click();
  });
  expect(onChildClick).toHaveBeenCalledWith("c1");
});

test("onChildClick が未指定なら子タスクのボタンは無効化される", () => {
  render({
    parentTask: PARENT,
    childTasks: [makeTask({ id: "c1", title: "子1" })],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  const child = document.querySelector(
    '[data-testid="sub-issue-item-c1"]',
  ) as HTMLButtonElement;
  expect(child.disabled).toBe(true);
});
