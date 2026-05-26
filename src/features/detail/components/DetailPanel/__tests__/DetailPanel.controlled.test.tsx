import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { DetailPanel } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

/** テスト用カラム一覧 */
const testColumns = [
  { name: "Todo", order: 0 },
  { name: "Doing", order: 1 },
  { name: "Done", order: 2 },
];

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * テスト用タスクを生成する。
 * @param overrides 上書きするフィールド
 * @returns テスト用タスク
 */
const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
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

/**
 * DetailPanel をレンダリングする。
 * @param props 渡す props
 * @returns rerender ヘルパ
 */
const render = (props: Parameters<typeof DetailPanel>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailPanel, props));
  });
  return {
    rerender: (next: Parameters<typeof DetailPanel>[0]) => {
      act(() => {
        root?.render(createElement(DetailPanel, next));
      });
    },
  };
};

/**
 * data-testid から HTMLSelectElement を取得する。
 * @param testId data-testid 値
 * @returns 該当 select 要素
 */
const getSelect = (testId: string): HTMLSelectElement =>
  document.querySelector(`[data-testid="${testId}"]`) as HTMLSelectElement;

/**
 * select 要素に change イベントを発火する。
 * @param select 対象 select 要素
 * @param value 設定する value
 */
const changeSelectValue = (select: HTMLSelectElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

test("初期 task.status が StatusSelect の選択値に反映される", () => {
  render({
    task: createTask({ status: "Doing" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  expect(getSelect("status-select").value).toBe("Doing");
});

test("task.status が rerender で差し替わると StatusSelect 表示が追従する", () => {
  const onTaskUpdate = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const { rerender } = render({
    task: createTask({ status: "Doing" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  expect(getSelect("status-select").value).toBe("Doing");
  rerender({
    task: createTask({ status: "Done" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  expect(getSelect("status-select").value).toBe("Done");
});

test("task.priority undefined ↔ value の rerender で PrioritySelect 表示が追従する", () => {
  const onTaskUpdate = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const { rerender } = render({
    task: createTask({ priority: undefined }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  expect(getSelect("priority-select").value).toBe("");
  rerender({
    task: createTask({ priority: "High" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  expect(getSelect("priority-select").value).toBe("High");
  rerender({
    task: createTask({ priority: undefined }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  expect(getSelect("priority-select").value).toBe("");
});

test("StatusSelect 操作で onTaskUpdate(task.id, { status }) が partial 形で呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "task-1", status: "Todo" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  changeSelectValue(getSelect("status-select"), "Doing");
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { status: "Doing" });
});

test("PrioritySelect 操作で onTaskUpdate(task.id, { priority }) が partial 形で呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "task-1", priority: undefined }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  changeSelectValue(getSelect("priority-select"), "High");
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { priority: "High" });
});

test("PrioritySelect で「なし」を選ぶと onTaskUpdate(task.id, { priority: undefined }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "task-1", priority: "High" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  changeSelectValue(getSelect("priority-select"), "");
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { priority: undefined });
});

test("ParentLink クリックで onSelectTask が parentTask.id 引数で 1 回呼ばれる", () => {
  const onSelectTask = vi.fn();
  const parent = createTask({
    id: "parent-id",
    title: "親",
    filePath: "tasks/parent.md",
  });
  const child = createTask({
    id: "child-id",
    filePath: "tasks/child.md",
    parent: "tasks/parent.md",
  });
  render({
    task: child,
    columns: testColumns,
    allTasks: [parent, child],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onSelectTask,
  });
  const link = document.querySelector(
    '[data-testid="detail-parent-link"]',
  ) as HTMLButtonElement;
  expect(link).toBeTruthy();
  act(() => {
    link.click();
  });
  expect(onSelectTask).toHaveBeenCalledTimes(1);
  expect(onSelectTask).toHaveBeenCalledWith("parent-id");
});

test("SubIssueSection 子クリックで onSelectTask が childId 引数で 1 回呼ばれる", () => {
  const onSelectTask = vi.fn();
  const parent = createTask({
    id: "parent-id",
    title: "親",
    filePath: "tasks/parent.md",
  });
  const child = createTask({
    id: "child-id",
    title: "子1",
    filePath: "tasks/child.md",
    parent: "tasks/parent.md",
  });
  render({
    task: parent,
    columns: testColumns,
    allTasks: [parent, child],
    doneColumn: "Done",
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddSubIssue: vi.fn(),
    onSelectTask,
  });
  const childBtn = document.querySelector(
    '[data-testid="sub-issue-item-child-id"]',
  ) as HTMLButtonElement;
  expect(childBtn).toBeTruthy();
  expect(childBtn.disabled).toBe(false);
  act(() => {
    childBtn.click();
  });
  expect(onSelectTask).toHaveBeenCalledTimes(1);
  expect(onSelectTask).toHaveBeenCalledWith("child-id");
});
