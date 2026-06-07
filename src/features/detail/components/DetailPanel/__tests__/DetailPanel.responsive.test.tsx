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
 * 指定 testid の要素の className を取得する。
 * @param testId - data-testid
 * @returns className 文字列
 */
const classOf = (testId: string): string =>
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement)
    .className;

test("パネル（aside）の幅クラスに w-full と sm:w-[480px] を含む", () => {
  render(buildProps());
  const aside = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(aside.className).toContain("w-full");
  expect(aside.className).toContain("sm:w-[480px]");
});

test("本文ラッパのパディングに p-3 と sm:p-4 を含む", () => {
  render(buildProps());
  const aside = document.querySelector('[role="dialog"]') as HTMLElement;
  const bodyWrapper = Array.from(aside.querySelectorAll("div")).find((el) =>
    el.className.includes("overflow-y-auto"),
  ) as HTMLElement;
  expect(bodyWrapper.className).toContain("p-3");
  expect(bodyWrapper.className).toContain("sm:p-4");
});

test("全画面で開くボタンに focus-visible リング（accent）クラスを含む", () => {
  render(buildProps());
  const cls = classOf("detail-expand-button");
  expect(cls).toContain("focus-visible:ring-2");
  expect(cls).toContain("focus-visible:ring-accent");
});

test("閉じるボタンに focus-visible リング（accent）クラスを含む", () => {
  render(buildProps());
  const closeBtn = document.querySelector(
    '[aria-label="閉じる"]',
  ) as HTMLElement;
  expect(closeBtn.className).toContain("focus-visible:ring-2");
  expect(closeBtn.className).toContain("focus-visible:ring-accent");
});

test("削除ボタンに focus-visible リング（red）クラスを含む", () => {
  render(buildProps());
  const cls = classOf("detail-delete-button");
  expect(cls).toContain("focus-visible:ring-2");
  expect(cls).toContain("focus-visible:ring-red-500");
});

test("既存の data-testid / role / aria が維持される（回帰）", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="detail-overlay"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="detail-expand-button"]'),
  ).toBeTruthy();
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="閉じる"]')).toBeTruthy();
});
