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
    body: "本文",
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

/**
 * 指定 testid の要素を click する。
 * @param testId - data-testid
 */
const click = (testId: string): void => {
  act(() => {
    (
      document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
    ).click();
  });
};

test("「← 戻る」押下で onBack が呼ばれる", () => {
  const onBack = vi.fn();
  render(buildProps({ onBack }));
  click("detail-back-button");
  expect(onBack).toHaveBeenCalledOnce();
});

test("Esc キーで onBack が呼ばれる", () => {
  const onBack = vi.fn();
  render(buildProps({ onBack }));
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(onBack).toHaveBeenCalledOnce();
});

test("削除 ConfirmDialog 表示中の Esc は onBack を発火しない（Esc 抑止）", () => {
  const onBack = vi.fn();
  render(buildProps({ onBack }));
  click("detail-delete-button");
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(onBack).not.toHaveBeenCalled();
});

test("サイドバー操作（Status 変更）で onTaskUpdate（共有ハンドラ）が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(buildProps({ task: createTask({ id: "t-up" }), onTaskUpdate }));
  const select = document.querySelector(
    '[data-testid="status-select"]',
  ) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(select, "Done");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-up", { status: "Done" });
});
