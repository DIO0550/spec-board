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
  click("status-field");
  click("status-field-option-Done");
  expect(onTaskUpdate).toHaveBeenCalledWith("t-up", { status: "Done" });
});

test("サイドバー操作（Priority 変更）で onTaskUpdate が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(buildProps({ task: createTask({ id: "t-pri" }), onTaskUpdate }));
  click("priority-field");
  click("priority-field-option-High");
  expect(onTaskUpdate).toHaveBeenCalledWith("t-pri", { priority: "High" });
});

test("タイトル編集確定で onTaskUpdate(id, { title }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t-title", title: "元タイトル" }),
      onTaskUpdate,
    }),
  );
  act(() => {
    (
      document.querySelector(
        '[data-testid="editable-text-display"]',
      ) as HTMLElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "新タイトル");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-title", { title: "新タイトル" });
});

test("本文編集確定（Cmd+Enter）で onTaskUpdate(id, { body }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t-body", body: "元の本文" }),
      onTaskUpdate,
    }),
  );
  act(() => {
    (
      document.querySelector('[data-testid="markdown-body"]') as HTMLElement
    ).click();
  });
  const textarea = document.querySelector(
    '[data-testid="markdown-body-textarea"]',
  ) as HTMLTextAreaElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, "新しい本文");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-body", { body: "新しい本文" });
});
