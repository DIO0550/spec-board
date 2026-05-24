import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { DetailPanel } from "..";

let container: HTMLDivElement;
let root: Root;

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/**
 * テスト用タスクを生成する。
 * @param overrides - 上書きするフィールド
 * @returns Task インスタンス
 */
const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "元の本文",
    filePath: "tasks/test.md",
    ...overrides,
  });

type DetailPanelProps = Parameters<typeof DetailPanel>[0];

const render = (
  props: DetailPanelProps,
): { rerender: (next: DetailPanelProps) => void } => {
  act(() => {
    root.render(createElement(DetailPanel, props));
  });
  const rerender = (next: DetailPanelProps): void => {
    act(() => {
      root.render(createElement(DetailPanel, next));
    });
  };
  return { rerender };
};

const queryTextarea = (): HTMLTextAreaElement | null =>
  document.querySelector<HTMLTextAreaElement>(
    '[data-testid="markdown-body-textarea"]',
  );

const requireTextarea = (): HTMLTextAreaElement => {
  const textarea = queryTextarea();
  expect(textarea).not.toBeNull();
  return textarea as HTMLTextAreaElement;
};

const queryDisplay = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="markdown-body"]');

const requireDisplay = (): HTMLElement => {
  const display = queryDisplay();
  expect(display).not.toBeNull();
  return display as HTMLElement;
};

const clickDisplay = (): void => {
  const display = requireDisplay();
  act(() => {
    display.click();
  });
};

const setTextareaValue = (value: string): void => {
  const textarea = requireTextarea();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

type KeyInit = {
  metaKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
};

const pressKeyOn = (target: Element, key: string, init: KeyInit = {}): void => {
  act(() => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      metaKey: init.metaKey ?? false,
      ctrlKey: init.ctrlKey ?? false,
    });
    Object.defineProperty(event, "isComposing", {
      value: init.isComposing ?? false,
    });
    target.dispatchEvent(event);
  });
};

test("body 編集確定で onTaskUpdate(task.id, { body }) が発火する", () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "task-1", body: "元の本文" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  clickDisplay();
  setTextareaValue("新しい本文");
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { body: "新しい本文" });
});

test("編集中の Esc で onClose と onTaskUpdate が呼ばれない", () => {
  const onTaskUpdate = vi.fn();
  const onClose = vi.fn();
  render({
    task: createTask({ body: "元の本文" }),
    columns: testColumns,
    onClose,
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  clickDisplay();
  setTextareaValue("捨てる文字列");
  pressKeyOn(requireTextarea(), "Escape");
  expect(onTaskUpdate).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test("未変更(strict equality)の Cmd+Enter で onTaskUpdate は呼ばれない", () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ body: "元の本文" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  clickDisplay();
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onTaskUpdate).not.toHaveBeenCalled();
});

test("既存 body から空文字へ更新する Cmd+Enter で onTaskUpdate(id, { body: '' }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "task-1", body: "元の本文" }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  clickDisplay();
  setTextareaValue("");
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { body: "" });
});

test("編集中に task props が切替わると edit 状態がリセットされ、新タスクの body で再編集確定すると新タスクの id + 新タスク向け body で呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const taskA = createTask({ id: "task-A", body: "A の本文" });
  const taskB = createTask({ id: "task-B", body: "B の本文" });
  const { rerender } = render({
    task: taskA,
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  clickDisplay();
  setTextareaValue("Aへの未保存ドラフト");

  // props 切替: 表示対象を task B に差替
  rerender({
    task: taskB,
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  // textarea は消えて display に戻っている（key={task.id} 再マウントによる state リセット）
  expect(queryTextarea()).toBeNull();
  const display = requireDisplay();
  expect(display.textContent).toContain("B の本文");

  // 改めて task B を編集して確定
  clickDisplay();
  setTextareaValue("B 向けの新内容");
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-B", {
    body: "B 向けの新内容",
  });
});
