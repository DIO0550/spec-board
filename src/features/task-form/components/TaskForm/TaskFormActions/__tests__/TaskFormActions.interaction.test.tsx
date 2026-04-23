import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormActions } from "..";
import { CancelButton } from "../CancelButton";
import { SubmitButton } from "../SubmitButton";

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

type RenderOptions = {
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  disabled?: boolean;
};

const render = (opts: RenderOptions = {}) => {
  const {
    submitLabel = "作成",
    cancelLabel = "キャンセル",
    onCancel = vi.fn(),
    disabled = false,
  } = opts;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        TaskFormActions,
        null,
        createElement(
          CancelButton,
          { onClick: onCancel, disabled },
          cancelLabel,
        ),
        createElement(SubmitButton, { disabled }, submitLabel),
      ),
    );
  });
};

test("キャンセル / 送信ボタンの両方が描画される", () => {
  render();
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
  render();
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(submit.getAttribute("type")).toBe("submit");
});

test("キャンセルボタンは type='button'（デフォルト）", () => {
  render();
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  expect(cancel.getAttribute("type")).toBe("button");
});

test("キャンセルボタン click で onCancel が呼ばれる", () => {
  const onCancel = vi.fn();
  render({ onCancel });
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  act(() => {
    cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("disabled=true で両ボタンが disabled（各 props 経由で伝播）", () => {
  render({ disabled: true });
  const cancel = container?.querySelector(
    "[data-testid='task-form-cancel']",
  ) as HTMLButtonElement;
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(cancel.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
});

test("submitLabel='カスタム' が children として render される", () => {
  render({ submitLabel: "カスタム" });
  const submit = container?.querySelector(
    "[data-testid='task-form-submit']",
  ) as HTMLButtonElement;
  expect(submit.textContent).toBe("カスタム");
});
