import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/task";
import { TaskCreateModal } from "..";

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

const COLUMNS: Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

/**
 * TaskCreateModal をレンダリングするヘルパー
 * @param props - TaskCreateModal に渡す props
 */
function render(props: Parameters<typeof TaskCreateModal>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskCreateModal, props));
  });
}

/**
 * 指定した input の value を変更して input イベントを発火する
 * （React の onChange は text input の input イベントで発火するため）
 * @param el - 対象要素
 * @param value - 設定する値
 */
function changeValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * マイクロタスクキューを flush するユーティリティ
 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test("モーダルが開きダイアログが表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="task-create-dialog"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-create-overlay"]'),
  ).toBeTruthy();
});

test("ステータス初期値が作成元カラムのステータスになる", () => {
  render({
    columns: COLUMNS,
    initialStatus: "In Progress",
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  });
  const status = document.querySelector(
    '[data-testid="task-form-status"]',
  ) as HTMLSelectElement;
  expect(status.value).toBe("In Progress");
});

test("タイトル入力して送信すると onSubmit が呼ばれ成功でモーダルが閉じる", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onClose,
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeValue(title, "新しいタスク");
  });
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await flush();
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit.mock.calls[0][0].title).toBe("新しいタスク");
  expect(onClose).toHaveBeenCalledOnce();
});

test("onSubmit が reject するとモーダルは閉じない", async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
  const onClose = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onClose,
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeValue(title, "T");
  });
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await flush();
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(
    document.querySelector('[data-testid="task-create-dialog"]'),
  ).toBeTruthy();
});

test("Esc キーで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onClose,
  });
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test("オーバーレイクリックで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onClose,
  });
  const overlay = document.querySelector(
    '[data-testid="task-create-overlay"]',
  ) as HTMLElement;
  act(() => {
    overlay.click();
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test("キャンセルボタンで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onClose,
  });
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  act(() => {
    cancel.click();
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test("タイトル空で送信するとバリデーションエラー表示で onSubmit は呼ばれない", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onClose: vi.fn(),
  });
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(
    document.querySelector('[data-testid="task-form-title-error"]'),
  ).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});
