import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "@/types/task";
import { DetailPanel } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

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
function createTask(overrides: Partial<Task> = {}): Task {
  return {
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
  };
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

test("「削除」ボタンクリックで確認ダイアログが表示される", async () => {
  render({
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="detail-delete-button"]'),
    ).toBeTruthy();
  });
  const deleteButton = document.querySelector(
    '[data-testid="detail-delete-button"]',
  ) as HTMLElement;
  act(() => {
    deleteButton.click();
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="confirm-dialog"]'),
    ).toBeTruthy();
  });
});

test("確定でonDeleteが呼ばれる", async () => {
  const onDelete = vi.fn();
  render({
    task: createTask({ id: "task-42" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete,
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="detail-delete-button"]'),
    ).toBeTruthy();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-delete-button"]',
      ) as HTMLElement
    ).click();
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="confirm-confirm-button"]'),
    ).toBeTruthy();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLElement
    ).click();
  });
  expect(onDelete).toHaveBeenCalledWith("task-42");
});

test("キャンセルでダイアログが閉じ削除されない", async () => {
  const onDelete = vi.fn();
  render({
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete,
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="detail-delete-button"]'),
    ).toBeTruthy();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-delete-button"]',
      ) as HTMLElement
    ).click();
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="confirm-dialog"]'),
    ).toBeTruthy();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-cancel-button"]',
      ) as HTMLElement
    ).click();
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  });
  expect(onDelete).not.toHaveBeenCalled();
});

test("onDeleteが失敗した場合、ダイアログが開いたままでisDeleteが解除される", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("削除失敗"));
  render({
    task: createTask({ id: "task-fail" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete,
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="detail-delete-button"]'),
    ).toBeTruthy();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-delete-button"]',
      ) as HTMLElement
    ).click();
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="confirm-confirm-button"]'),
    ).toBeTruthy();
  });
  await act(async () => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLElement
    ).click();
  });
  expect(onDelete).toHaveBeenCalledWith("task-fail");
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="confirm-dialog"]'),
    ).toBeTruthy();
    const confirmBtn = document.querySelector(
      '[data-testid="confirm-confirm-button"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    expect(confirmBtn.textContent).toBe("削除");
  });
});

test("ファイルパスがパネル下部に表示される", async () => {
  render({
    task: createTask({ filePath: "projects/my-task.md" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    const filePath = document.querySelector('[data-testid="detail-file-path"]');
    expect(filePath).toBeTruthy();
    expect(filePath?.textContent).toBe("projects/my-task.md");
  });
});
