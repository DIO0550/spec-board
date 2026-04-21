import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormActions } from "..";

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

const render = (props: Parameters<typeof TaskFormActions>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormActions, props));
  });
};

test("キャンセル / 送信ボタンの両方が描画される", () => {
  render({
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onCancel: vi.fn(),
    isSubmitting: false,
  });
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(cancel).toBeTruthy();
  expect(cancel.textContent).toBe("キャンセル");
  expect(submit).toBeTruthy();
  expect(submit.textContent).toBe("作成");
});

test("送信ボタンが type='submit' を持つ（Button のデフォルト 'button' の上書きを検出）", () => {
  render({
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onCancel: vi.fn(),
    isSubmitting: false,
  });
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(submit.getAttribute("type")).toBe("submit");
});

test("キャンセルボタンは type='button'（デフォルト）", () => {
  render({
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onCancel: vi.fn(),
    isSubmitting: false,
  });
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  expect(cancel.getAttribute("type")).toBe("button");
});

test("キャンセルボタン click で onCancel が呼ばれる", () => {
  const onCancel = vi.fn();
  render({
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onCancel,
    isSubmitting: false,
  });
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  act(() => {
    cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("isSubmitting=true で両ボタンが disabled", () => {
  render({
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onCancel: vi.fn(),
    isSubmitting: true,
  });
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(cancel.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
});

test("submitLabel='カスタム' が render される", () => {
  render({
    submitLabel: "カスタム",
    cancelLabel: "キャンセル",
    onCancel: vi.fn(),
    isSubmitting: false,
  });
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(submit.textContent).toBe("カスタム");
});
