import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { TitleValidationError } from "@/features/task-form/lib/fields/title";
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

test("error 指定で aria 属性が描画される", () => {
  render({
    value: "",
    onChange: vi.fn(),
    disabled: false,
    error: { code: "EMPTY" },
  });
  const input = container?.querySelector(
    "[data-testid='task-form-title']",
  ) as HTMLInputElement;
  const errorEl = container?.querySelector(
    "[data-testid='task-form-title-error']",
  );
  expect(errorEl).toBeTruthy();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe(errorEl?.id);
});

test("3 種エラーそれぞれで対応する日本語メッセージが描画される", () => {
  const cases: Array<[TitleValidationError, string, string]> = [
    [{ code: "EMPTY" }, "タイトルを入力してください", "EMPTY"],
    [
      { code: "TOO_LONG", max: 200, actual: 201 },
      "タイトルは200文字以内で入力してください",
      "TOO_LONG",
    ],
    [
      { code: "FORBIDDEN_CHAR", chars: ["<", ">"] },
      "使用できない文字が含まれています: < >",
      "FORBIDDEN_CHAR",
    ],
  ];
  for (const [error, expected, label] of cases) {
    render({
      value: "",
      onChange: vi.fn(),
      disabled: false,
      error,
    });
    const errorEl = container?.querySelector(
      "[data-testid='task-form-title-error']",
    );
    expect(errorEl?.textContent, label).toBe(expected);
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  }
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
