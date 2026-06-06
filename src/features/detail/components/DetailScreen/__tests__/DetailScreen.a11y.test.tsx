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
 * ルートの landmark section を取得する。
 * @returns section 要素
 */
const getSection = (): HTMLElement =>
  document.querySelector('section[aria-label="タスク詳細"]') as HTMLElement;

test("タスクタイトルを表す h1 が 1 つ存在する", () => {
  render(buildProps({ task: createTask({ title: "見出しタスク" }) }));
  const headings = document.querySelectorAll("h1");
  expect(headings.length).toBe(1);
  expect(headings[0].textContent).toBe("見出しタスク");
});

test("タイトルが空のとき h1 は filePath を表示する", () => {
  render(
    buildProps({
      task: createTask({ title: "", filePath: "tasks/empty-title.md" }),
    }),
  );
  expect(document.querySelector("h1")?.textContent).toBe(
    "tasks/empty-title.md",
  );
});

test("ルート section が aria-label と tabIndex=-1 を持つランドマークである", () => {
  render(buildProps());
  const section = getSection();
  expect(section).toBeTruthy();
  expect(section.getAttribute("tabindex")).toBe("-1");
});

test("マウント時にルート section へフォーカスが移る", () => {
  render(buildProps());
  expect(document.activeElement).toBe(getSection());
});

test("戻るボタンに focus-visible リングクラスを含む", () => {
  render(buildProps());
  const cls = (
    document.querySelector('[data-testid="detail-back-button"]') as HTMLElement
  ).className;
  expect(cls).toContain("focus-visible:ring-2");
  expect(cls).toContain("focus-visible:ring-blue-500");
});

test("削除ボタンに focus-visible リング（red）クラスを含む", () => {
  render(buildProps());
  const cls = (
    document.querySelector(
      '[data-testid="detail-delete-button"]',
    ) as HTMLElement
  ).className;
  expect(cls).toContain("focus-visible:ring-2");
  expect(cls).toContain("focus-visible:ring-red-500");
});

test("md ブレークポイントの 2 ペインクラスが維持される", () => {
  render(buildProps());
  const section = getSection();
  expect(section.className).toContain("md:flex-row");
  const sidebarWrapper = Array.from(section.children).find((el) =>
    el.className.includes("md:w-[360px]"),
  ) as HTMLElement;
  expect(sidebarWrapper).toBeTruthy();
  expect(sidebarWrapper.className).toContain("md:border-l");
});

test("既存の data-testid が維持される（回帰）", () => {
  render(buildProps());
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="editable-text-display"]'),
  ).toBeTruthy();
  expect(document.querySelector('[data-testid="markdown-body"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="detail-delete-button"]'),
  ).toBeTruthy();
});
