import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { DetailScreen } from "..";

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
    body: "# 見出し",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * DetailScreen の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailScreen の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof DetailScreen>[0]> = {},
): Parameters<typeof DetailScreen>[0] {
  return {
    task: overrides.task ?? createTask(),
    columns: testColumns,
    onBack: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

/**
 * DetailScreen をレンダリングするヘルパー
 * @param props - DetailScreen に渡す props
 */
function render(props: Parameters<typeof DetailScreen>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailScreen, props));
  });
}

test("左ペインに本文（タイトル + Markdown）が描画される", () => {
  render(buildProps({ task: createTask({ title: "詳細タスク" }) }));
  const title = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement | null;
  expect(title?.value).toBe("詳細タスク");
  expect(document.querySelector('[data-testid="markdown-body"]')).toBeTruthy();
});

test("右ペインにプロパティ（Status 等）と削除ボタンが描画される", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="detail-delete-button"]'),
  ).toBeTruthy();
});

test("「← 戻る」ボタンが描画される", () => {
  render(buildProps());
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();
});
