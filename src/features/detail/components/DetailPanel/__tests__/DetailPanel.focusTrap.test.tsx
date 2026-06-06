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

/**
 * 必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailPanel の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof DetailPanel>[0]> = {},
): Parameters<typeof DetailPanel>[0] {
  return {
    task: createTask(),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onExpand: vi.fn(),
    ...overrides,
  };
}

/**
 * Tab キーの keydown を document に dispatch する。
 * @param shiftKey - Shift 同時押しか
 * @returns dispatch した KeyboardEvent
 */
const dispatchTab = (shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    cancelable: true,
    bubbles: true,
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
};

test("マウント時にパネル（role=dialog）へフォーカスが移る（既存挙動の回帰）", () => {
  render(buildProps());
  const aside = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(document.activeElement).toBe(aside);
});

test("Tab でフォーカスがパネル内に閉じ込められる", () => {
  render(buildProps());
  const aside = document.querySelector('[role="dialog"]') as HTMLElement;
  // マウント時はパネル自身（tabIndex=-1）にフォーカスがあり focusable 上にないため、
  // Tab で先頭 focusable へ引き込まれてパネル内に留まる。
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(true);
  expect(aside.contains(document.activeElement)).toBe(true);
});

test("削除ダイアログ表示中はトラップが無効化され Tab が preventDefault されない", () => {
  render(buildProps());
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-delete-button"]',
      ) as HTMLElement
    ).click();
  });
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(false);
});

test("削除ダイアログ表示中の Esc は onClose（パネル閉じ）へ伝播しない", () => {
  const onClose = vi.fn();
  render(buildProps({ onClose }));
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-delete-button"]',
      ) as HTMLElement
    ).click();
  });
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(onClose).not.toHaveBeenCalled();
});
