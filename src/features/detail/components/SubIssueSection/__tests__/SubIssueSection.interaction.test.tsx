import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
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
function makeTask(overrides: Partial<TaskFromPayloadInput> = {}): Task {
  return Task.fromPayload({
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

test("子孫タスクが空でも追加ボタンは表示される（progressbar 非表示）", () => {
  render({
    parentTask: PARENT,
    childTasks: [],
    descendantTasks: [],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="sub-issue-add-button"]'),
  ).toBeTruthy();
  expect(document.querySelector('[role="progressbar"]')).toBeNull();
});

test("子タスクの進捗バーと完了/全数が表示される", () => {
  const tasks = [
    makeTask({ id: "c1", status: "Done" }),
    makeTask({ id: "c2", status: "Done" }),
    makeTask({ id: "c3", status: "Todo" }),
    makeTask({ id: "c4", status: "In Progress" }),
  ];
  render({
    parentTask: PARENT,
    childTasks: tasks,
    descendantTasks: tasks,
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
    descendantTasks: [],
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
  const c1 = makeTask({ id: "c1", title: "子1", filePath: "tasks/c1.md" });
  const parent = makeTask({
    id: "p-1",
    title: "親タスク",
    filePath: "tasks/parent.md",
    children: ["tasks/c1.md"],
  });
  render({
    parentTask: parent,
    childTasks: [c1],
    descendantTasks: [c1],
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
  const c1 = makeTask({ id: "c1", title: "子1", filePath: "tasks/c1.md" });
  const parent = makeTask({
    id: "p-1",
    title: "親タスク",
    filePath: "tasks/parent.md",
    children: ["tasks/c1.md"],
  });
  render({
    parentTask: parent,
    childTasks: [c1],
    descendantTasks: [c1],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  const child = document.querySelector(
    '[data-testid="sub-issue-item-c1"]',
  ) as HTMLButtonElement;
  expect(child.disabled).toBe(true);
});

test("descendantTasks=5件(done=3)、childTasks=2件: 進捗バー aria-valuenow=60、サマリ 3/5、<li> 2 件", () => {
  const c1 = makeTask({
    id: "c1",
    title: "子1",
    status: "Done",
    filePath: "tasks/c1.md",
  });
  const c2 = makeTask({
    id: "c2",
    title: "子2",
    status: "Todo",
    filePath: "tasks/c2.md",
  });
  const parent = makeTask({
    id: "p-1",
    title: "親タスク",
    filePath: "tasks/parent.md",
    children: ["tasks/c1.md", "tasks/c2.md"],
  });
  render({
    parentTask: parent,
    childTasks: [c1, c2],
    descendantTasks: [
      c1,
      c2,
      makeTask({ id: "g1", status: "Done" }),
      makeTask({ id: "g2", status: "Done" }),
      makeTask({ id: "g3", status: "Todo" }),
    ],
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("60");
  expect(document.body.textContent).toContain("3/5");
  const lis = document.querySelectorAll('[data-testid^="sub-issue-item-"]');
  expect(lis.length).toBe(2);
});

test("Board ↔ Detail 整合性: 3 階層 fixture（root + 子 1 + 孫 2、うち done 1）で SubIssueSection の進捗は 1/3 になる", () => {
  // 同じ fixture を Column.rendering.test.tsx の対応ケースとも整合させる。
  const grand1 = makeTask({ id: "g1", status: "Done" });
  const grand2 = makeTask({ id: "g2", status: "Todo" });
  const child = makeTask({ id: "c1", title: "子1", status: "Todo" });
  // collectDescendants の結果（root を含まない子孫）と同じ並び。
  const descendants = [child, grand1, grand2];

  render({
    parentTask: PARENT,
    childTasks: [child],
    descendantTasks: descendants,
    doneColumn: "Done",
    onAddSubIssue: vi.fn(),
  });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("33");
  expect(document.body.textContent).toContain("1/3");
});
