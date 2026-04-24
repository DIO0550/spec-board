import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormTitle } from "..";

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

const render = (props: Parameters<typeof TaskFormTitle>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormTitle, props));
  });
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

test("error 未指定で input が描画され aria-invalid=false / error p なし", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  const input = container?.querySelector(
    "[data-testid='task-form-title']",
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(input.getAttribute("aria-describedby")).toBeNull();
  expect(
    container?.querySelector("[data-testid='task-form-title-error']"),
  ).toBeNull();
});

test("入力で onChange が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: false });
  const input = container?.querySelector(
    "[data-testid='task-form-title']",
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "abc");
  });
  expect(onChange).toHaveBeenCalledWith("abc");
});

test("error 指定で error メッセージと aria 属性が描画される", () => {
  render({
    value: "",
    onChange: vi.fn(),
    disabled: false,
    error: "必須",
  });
  const input = container?.querySelector(
    "[data-testid='task-form-title']",
  ) as HTMLInputElement;
  const errorEl = container?.querySelector(
    "[data-testid='task-form-title-error']",
  );
  expect(errorEl?.textContent).toBe("必須");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe(errorEl?.id);
});

test("label の htmlFor と input の id が一致する", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  const label = container?.querySelector("label") as HTMLLabelElement;
  const input = container?.querySelector(
    "[data-testid='task-form-title']",
  ) as HTMLInputElement;
  expect(label.htmlFor).toBe(input.id);
});

test("disabled=true で input が disabled", () => {
  render({ value: "x", onChange: vi.fn(), disabled: true });
  const input = container?.querySelector(
    "[data-testid='task-form-title']",
  ) as HTMLInputElement;
  expect(input.disabled).toBe(true);
});
