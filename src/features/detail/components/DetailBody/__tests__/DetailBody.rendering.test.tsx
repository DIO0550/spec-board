import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload, type TaskWarning } from "@/types/task";
import { DetailBody } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

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
 * DetailBody をレンダリングするヘルパー
 * @param props - DetailBody に渡す props
 */
function render(props: Parameters<typeof DetailBody>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailBody, props));
  });
}

const cycleWarning: TaskWarning = {
  code: "parentCycle",
  field: "parent",
  message: "parent chain forms a cycle",
};
const parseWarning: TaskWarning = {
  code: "invalidStatusUsedDefault",
  field: "status",
  message: "invalid status, used default",
};

test("タイトル(EditableText) と MarkdownBody が描画される", () => {
  render({
    task: createTask({ title: "本文タイトル", body: "# 見出し" }),
    onTitleConfirm: vi.fn(),
    onBodyConfirm: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement | null;
  expect(title?.value).toBe("本文タイトル");
  expect(document.querySelector('[data-testid="markdown-body"]')).toBeTruthy();
});

test("循環 warning ありで CycleWarningBanner が描画される", () => {
  render({
    task: createTask({ warnings: [cycleWarning] }),
    onTitleConfirm: vi.fn(),
    onBodyConfirm: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="cycle-warning-banner"]'),
  ).toBeTruthy();
});

test("パースエラー warning ありで ParseErrorBanner が描画される", () => {
  render({
    task: createTask({ warnings: [parseWarning] }),
    onTitleConfirm: vi.fn(),
    onBodyConfirm: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="parse-error-banner"]'),
  ).toBeTruthy();
});

test("ParentLink / BrokenParentRow は左ペインに描画されない（Parent はサイドバー集約）", () => {
  render({
    task: createTask({ parent: "tasks/parent.md" }),
    onTitleConfirm: vi.fn(),
    onBodyConfirm: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-testid="broken-parent-row"]'),
  ).toBeNull();
});

test("タイトル確定で onTitleConfirm が呼ばれる", () => {
  const onTitleConfirm = vi.fn();
  render({
    task: createTask({ title: "旧タイトル" }),
    onTitleConfirm,
    onBodyConfirm: vi.fn(),
  });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, "新タイトル");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onTitleConfirm).toHaveBeenCalledWith("新タイトル");
});
