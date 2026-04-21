import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormLabels } from "..";

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

const defaultProps = (
  overrides: Partial<Parameters<typeof TaskFormLabels>[0]> = {},
): Parameters<typeof TaskFormLabels>[0] => ({
  labels: [],
  labelInput: "",
  setInput: vi.fn(),
  commit: vi.fn(),
  remove: vi.fn(),
  handleKeyDown: vi.fn(),
  disabled: false,
  ...overrides,
});

const render = (props: Parameters<typeof TaskFormLabels>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormLabels, props));
  });
};

test("labels=['a'] で chip と × ボタン、input が描画される", () => {
  render(defaultProps({ labels: ["a"] }));
  const chip = container?.querySelector(
    "button[aria-label='ラベル「a」を削除']",
  );
  expect(chip).toBeTruthy();
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  );
  expect(input).toBeTruthy();
});

test("input 入力で setInput が呼ばれる", () => {
  const setInput = vi.fn();
  render(defaultProps({ setInput }));
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, "b");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(setInput).toHaveBeenCalledWith("b");
});

test("Enter キーで handleKeyDown が呼ばれる", () => {
  const handleKeyDown = vi.fn();
  render(defaultProps({ handleKeyDown }));
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(handleKeyDown).toHaveBeenCalledTimes(1);
});

test("input blur で commit が呼ばれる", () => {
  const commit = vi.fn();
  render(defaultProps({ commit }));
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  act(() => {
    input.focus();
  });
  act(() => {
    input.blur();
  });
  expect(commit).toHaveBeenCalledTimes(1);
});

test("× ボタン click で remove(label) が呼ばれる", () => {
  const remove = vi.fn();
  render(defaultProps({ labels: ["a"], remove }));
  const btn = container?.querySelector(
    "button[aria-label='ラベル「a」を削除']",
  ) as HTMLButtonElement;
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(remove).toHaveBeenCalledWith("a");
});

test("disabled=true で input と × ボタンが両方 disabled", () => {
  render(defaultProps({ labels: ["a"], disabled: true }));
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  const btn = container?.querySelector(
    "button[aria-label='ラベル「a」を削除']",
  ) as HTMLButtonElement;
  expect(input.disabled).toBe(true);
  expect(btn.disabled).toBe(true);
});
