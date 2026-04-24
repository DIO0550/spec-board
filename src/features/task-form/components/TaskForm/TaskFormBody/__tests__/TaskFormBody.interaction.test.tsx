import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormBody } from "..";

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

const render = (props: Parameters<typeof TaskFormBody>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormBody, props));
  });
};

test("textarea が描画され value が反映される", () => {
  render({ value: "hello", onChange: vi.fn(), disabled: false });
  const ta = container?.querySelector(
    "[data-testid='task-form-body']",
  ) as HTMLTextAreaElement;
  expect(ta).toBeTruthy();
  expect(ta.value).toBe("hello");
});

test("入力で onChange が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: false });
  const ta = container?.querySelector(
    "[data-testid='task-form-body']",
  ) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(ta, "new");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("new");
});

test("disabled=true で textarea が disabled", () => {
  render({ value: "", onChange: vi.fn(), disabled: true });
  const ta = container?.querySelector(
    "[data-testid='task-form-body']",
  ) as HTMLTextAreaElement;
  expect(ta.disabled).toBe(true);
});
