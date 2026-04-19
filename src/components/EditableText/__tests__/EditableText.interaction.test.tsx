import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { EditableText } from "..";

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
 * EditableText をレンダリングするヘルパー
 * @param props - EditableText に渡す props
 */
function render(props: Parameters<typeof EditableText>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(EditableText, props));
  });
}

/**
 * コンポーネントを再レンダリングする
 */
function rerender(props: Parameters<typeof EditableText>[0]) {
  act(() => {
    root?.render(createElement(EditableText, props));
  });
}

/**
 * input 要素に値を設定し input イベントを発火する
 */
function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

test("初期表示でテキストが表示される", () => {
  render({ value: "タスクタイトル", onConfirm: vi.fn() });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  expect(display).toBeTruthy();
  expect(display.value).toBe("タスクタイトル");
});

test("クリックで編集モードになる", () => {
  render({ value: "タスクタイトル", onConfirm: vi.fn() });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.value).toBe("タスクタイトル");
});

test("Enterで確定しonConfirmが呼ばれる", () => {
  const onConfirm = vi.fn();
  render({ value: "元の値", onConfirm });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "新しい値");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onConfirm).toHaveBeenCalledWith("新しい値");
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("Escでキャンセルし元の値に戻る", () => {
  const onConfirm = vi.fn();
  render({ value: "元の値", onConfirm });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "変更中");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(onConfirm).not.toHaveBeenCalled();
  const displayAfter = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  expect(displayAfter?.value).toBe("元の値");
});

test("空文字または空白のみで確定すると元に戻る", () => {
  const onConfirm = vi.fn();
  render({ value: "元の値", onConfirm });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onConfirm).not.toHaveBeenCalled();
  const displayAfter = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  expect(displayAfter?.value).toBe("元の値");

  // 空白のみのケースも同様に元に戻る
  act(() => {
    displayAfter.click();
  });
  const inputAgain = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(inputAgain, "   ");
  });
  act(() => {
    inputAgain.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onConfirm).not.toHaveBeenCalled();
  const displayFinal = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement;
  expect(displayFinal?.value).toBe("元の値");
});

test("blurで確定しonConfirmが呼ばれる", () => {
  const onConfirm = vi.fn();
  render({ value: "元の値", onConfirm });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "  新しい値  ");
  });
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onConfirm).toHaveBeenCalledWith("新しい値");
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("trim後の値が既存valueと同一のときonConfirmは呼ばれない", () => {
  const onConfirm = vi.fn();
  render({ value: "元の値", onConfirm });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "  元の値  ");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onConfirm).not.toHaveBeenCalled();
});

test("編集中に外部valueが変化してもeditValueは保持される", () => {
  const onConfirm = vi.fn();
  render({ value: "元の値", onConfirm });
  const display = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLElement;
  act(() => {
    display.click();
  });
  const input = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "ユーザー入力中");
  });

  // 編集中に外部から value を差し替え
  rerender({ value: "外部更新", onConfirm });

  const inputAfter = document.querySelector(
    '[data-testid="editable-text-input"]',
  ) as HTMLInputElement;
  expect(inputAfter).toBeTruthy();
  expect(inputAfter.value).toBe("ユーザー入力中");
});
