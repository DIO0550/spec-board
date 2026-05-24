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
  { name: "In Progress", order: 1 },
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
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "タスクの本文",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * DetailPanel をレンダリングするヘルパー
 * @param props - DetailPanel に渡す props
 */
function render(props: Parameters<typeof DetailPanel>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailPanel, props));
  });
}

test("タスク選択時にパネルが表示される", async () => {
  render({
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });
});

test("タスクタイトルが表示される", async () => {
  render({
    task: createTask({ title: "ログイン修正" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    const titleInput = document.querySelector(
      '[data-testid="editable-text-display"]',
    ) as HTMLInputElement | null;
    expect(titleInput?.value).toBe("ログイン修正");
  });
});

test("×ボタンクリックでonCloseが呼ばれる", async () => {
  const onClose = vi.fn();
  render({
    task: createTask(),
    columns: testColumns,
    onClose,
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[aria-label="閉じる"]')).toBeTruthy();
  });
  const closeButton = document.querySelector(
    '[aria-label="閉じる"]',
  ) as HTMLElement;
  closeButton.click();
  expect(onClose).toHaveBeenCalledOnce();
});

test("Escキーでパネルが閉じる", async () => {
  const onClose = vi.fn();
  render({
    task: createTask(),
    columns: testColumns,
    onClose,
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test("オーバーレイクリックでパネルが閉じる", async () => {
  const onClose = vi.fn();
  render({
    task: createTask(),
    columns: testColumns,
    onClose,
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="detail-overlay"]'),
    ).toBeTruthy();
  });
  const overlay = document.querySelector(
    '[data-testid="detail-overlay"]',
  ) as HTMLElement;
  overlay.click();
  expect(onClose).toHaveBeenCalledOnce();
});

test("本文がMarkdownとしてレンダリングされる", async () => {
  render({
    task: createTask({ body: "# 見出し\n- リスト項目" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    const panel = document.querySelector('[role="dialog"]');
    expect(panel?.querySelector("h1")).toBeTruthy();
    expect(panel?.querySelector("h1")?.textContent).toBe("見出し");
    expect(panel?.querySelector("li")).toBeTruthy();
    expect(panel?.querySelector("li")?.textContent).toBe("リスト項目");
  });
});

test("allTasks から子タスクを解決してサブIssue 進捗を表示する", async () => {
  const parent = createTask({
    id: "parent",
    title: "親",
    filePath: "tasks/parent.md",
  });
  const child1 = createTask({
    id: "child-1",
    title: "子1",
    status: "Done",
    filePath: "tasks/child-1.md",
    parent: "tasks/parent.md",
  });
  const child2 = createTask({
    id: "child-2",
    title: "子2",
    status: "Todo",
    filePath: "tasks/child-2.md",
    parent: "tasks/parent.md",
  });
  const unrelated = createTask({
    id: "other",
    title: "別タスク",
    filePath: "tasks/other.md",
  });
  render({
    task: parent,
    columns: testColumns,
    allTasks: [parent, child1, child2, unrelated],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddSubIssue: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="sub-issue-section"]'),
    ).toBeTruthy();
  });
  const section = document.querySelector(
    '[data-testid="sub-issue-section"]',
  ) as HTMLElement;
  expect(section.textContent).toContain("サブIssue (1/2)");
  expect(
    document.querySelector('[data-testid="sub-issue-item-child-1"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="sub-issue-item-child-2"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="sub-issue-item-other"]'),
  ).toBeNull();
});

test("サブIssue 追加ボタンクリックで onAddSubIssue が親のファイルパス付きで呼ばれる", async () => {
  const onAddSubIssue = vi.fn();
  const parent = createTask({
    id: "parent",
    title: "親",
    filePath: "tasks/parent.md",
  });
  render({
    task: parent,
    columns: testColumns,
    allTasks: [parent],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddSubIssue,
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="sub-issue-add-button"]'),
    ).toBeTruthy();
  });
  const addButton = document.querySelector(
    '[data-testid="sub-issue-add-button"]',
  ) as HTMLElement;
  act(() => {
    addButton.click();
  });
  expect(onAddSubIssue).toHaveBeenCalledWith("tasks/parent.md");
});

test("親タスクが allTasks に存在し onSelectTask があるとき ParentLink が表示される", async () => {
  const parent = createTask({
    id: "parent",
    title: "親タスクABC",
    filePath: "tasks/parent.md",
  });
  const child = createTask({
    id: "child",
    title: "子タスク",
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
    onSelectTask: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="detail-parent-link"]'),
    ).toBeTruthy();
  });
  const link = document.querySelector(
    '[data-testid="detail-parent-link"]',
  ) as HTMLElement;
  expect(link.textContent).toBe("親: 親タスクABC");
});

test("parentFilePath が無い task では ParentLink が描画されない", async () => {
  render({
    task: createTask({ filePath: "tasks/standalone.md" }),
    columns: testColumns,
    allTasks: [],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onSelectTask: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
  expect(
    document.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeNull();
});

test("孤児参照（allTasks に親無し）のとき ParentLink が描画されない", async () => {
  const child = createTask({
    id: "child",
    filePath: "tasks/child.md",
    parent: "tasks/missing.md",
  });
  render({
    task: child,
    columns: testColumns,
    allTasks: [child],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onSelectTask: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
  expect(
    document.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeNull();
});

test("onSelectTask 未指定のとき ParentLink が描画されない", async () => {
  const parent = createTask({
    id: "parent",
    title: "親",
    filePath: "tasks/parent.md",
  });
  const child = createTask({
    id: "child",
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
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
  expect(
    document.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeNull();
});

test("allTasks 未指定のときサブIssue セクションは表示されない", async () => {
  render({
    task: createTask({ filePath: "tasks/parent.md" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddSubIssue: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeNull();
});
