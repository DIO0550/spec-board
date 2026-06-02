import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
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
function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "本文",
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

test("onExpand 指定時に全画面で開くボタンが描画される", () => {
  render({
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onExpand: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="detail-expand-button"]'),
  ).toBeTruthy();
});

test("全画面で開くボタン押下で onExpand が呼ばれる", () => {
  const onExpand = vi.fn();
  render({
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onExpand,
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-expand-button"]',
      ) as HTMLElement
    ).click();
  });
  expect(onExpand).toHaveBeenCalledOnce();
});

test("onExpand 未指定時は全画面で開くボタンが描画されない（後方互換）", () => {
  render({
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="detail-expand-button"]'),
  ).toBeNull();
});
