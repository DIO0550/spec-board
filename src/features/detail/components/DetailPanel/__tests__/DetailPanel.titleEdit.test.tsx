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
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * DetailPanel をレンダリングするヘルパー
 * @param props - DetailPanel に渡す props
 * @returns rerender ヘルパーを含むオブジェクト
 */
function render(props: Parameters<typeof DetailPanel>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailPanel, props));
  });
  const rerender = (next: Parameters<typeof DetailPanel>[0]) => {
    act(() => {
      root?.render(createElement(DetailPanel, next));
    });
  };
  return { rerender };
}

/**
 * editable-text-display 要素をクリックして Edit モードに遷移させる
 * @returns Edit モードの input 要素
 */
function enterEditMode(): HTMLInputElement {
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  act(() => {
    display.click();
  });
  return document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
}

/**
 * controlled input に値を流し込み input イベントを発火する
 * @param input - 対象 input 要素
 * @param value - 設定する値
 */
function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * input に keydown を dispatch する
 * @param input - 対象 input 要素
 * @param key - dispatch するキー名
 */
function pressKey(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

/**
 * editable-text-display が表示されるまで待つ
 */
async function waitForDisplay(): Promise<void> {
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="editable-text-display"]'),
    ).toBeTruthy();
  });
}

test("タイトル表示をクリックすると Edit モードに切り替わる", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ title: "元タイトル" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await waitForDisplay();
  enterEditMode();
  expect(
    document.querySelector('[data-testid="editable-text-input"]'),
  ).toBeTruthy();
  expect(onTaskUpdate).not.toHaveBeenCalled();
});

test("Enter で確定すると onTaskUpdate(task.id, { title }) が呼ばれる", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "task-1", title: "元タイトル" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await waitForDisplay();
  const input = enterEditMode();
  setInputValue(input, "新タイトル");
  pressKey(input, "Enter");
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { title: "新タイトル" });
});

test("Esc でキャンセルすると onTaskUpdate は呼ばれず表示が元に戻り、パネルも閉じない", async () => {
  // 編集中 Esc は EditableText 側で stopPropagation されているため
  // DetailPanel#useEscToClose 経由の onClose は発火しない契約を併せて検証する。
  const onTaskUpdate = vi.fn();
  const onClose = vi.fn();
  render({
    task: createTask({ title: "元タイトル" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await waitForDisplay();
  const input = enterEditMode();
  setInputValue(input, "捨てる文字列");
  pressKey(input, "Escape");
  expect(onTaskUpdate).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  expect(display.value).toBe("元タイトル");
});

test("空文字確定では onTaskUpdate が呼ばれない", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ title: "元タイトル" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await waitForDisplay();
  const input = enterEditMode();
  setInputValue(input, "   ");
  pressKey(input, "Enter");
  expect(onTaskUpdate).not.toHaveBeenCalled();
});

test("Enter 確定後に再度 Edit → Enter すると onTaskUpdate が 2 回呼ばれる（rerender で親 props 更新を伴う）", async () => {
  // 「確定後の最新タイトルから再編集できる」ことを保証するため、
  // 1 回目確定後に親 props (task.title) を更新する rerender ヘルパーで再描画してから 2 回目編集に入る。
  // rerender なしだと表示値が元タイトルに戻ったままになり、controlled コンポーネントとしての
  // 再編集挙動を検証できない（DetailPanel の `value={task.title || task.filePath}` 仕様より）。
  const onTaskUpdate = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const { rerender } = render({
    task: createTask({ id: "task-1", title: "元タイトル" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  await waitForDisplay();
  const firstInput = enterEditMode();
  setInputValue(firstInput, "1 回目タイトル");
  pressKey(firstInput, "Enter");
  // 親が onTaskUpdate を受けて task.title を更新した想定で rerender
  rerender({
    task: createTask({ id: "task-1", title: "1 回目タイトル" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete,
  });
  const secondInput = enterEditMode();
  setInputValue(secondInput, "2 回目タイトル");
  pressKey(secondInput, "Enter");
  expect(onTaskUpdate).toHaveBeenCalledTimes(2);
  expect(onTaskUpdate).toHaveBeenNthCalledWith(1, "task-1", {
    title: "1 回目タイトル",
  });
  expect(onTaskUpdate).toHaveBeenNthCalledWith(2, "task-1", {
    title: "2 回目タイトル",
  });
});

test("task.title が空で filePath fallback 表示でも編集確定で onTaskUpdate(id, { title }) が呼ばれる", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({
      id: "task-1",
      title: "",
      filePath: "tasks/fallback.md",
    }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    const display = document.querySelector(
      '[data-testid="editable-text-display"]',
    ) as HTMLInputElement | null;
    expect(display?.value).toBe("tasks/fallback.md");
  });
  const input = enterEditMode();
  setInputValue(input, "新タイトル");
  pressKey(input, "Enter");
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { title: "新タイトル" });
});
