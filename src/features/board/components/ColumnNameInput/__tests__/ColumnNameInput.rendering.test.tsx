import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { ColumnNameInputFieldProps } from "@/features/board/hooks/useInlineColumnNameInput";
import { ColumnNameInput, type ColumnNameInputProps } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

/**
 * getInputProps スタブを作る（必要な配線を上書き可能）。
 * @param overrides - 上書きしたいフィールド
 * @returns ColumnNameInputFieldProps スタブ
 */
const makeInputProps = (
  overrides: Partial<ColumnNameInputFieldProps> = {},
): ColumnNameInputFieldProps => ({
  ref: { current: null },
  value: "",
  onChange: vi.fn(),
  onKeyDown: vi.fn(),
  onBlur: vi.fn(),
  disabled: false,
  "aria-label": "カラム名",
  "aria-invalid": false,
  "aria-describedby": undefined,
  ...overrides,
});

/**
 * field スタブを作る。
 * @param opts - isDuplicate / errorId / inputProps 上書き
 * @returns ColumnNameInputProps["field"]
 */
const makeField = (opts: {
  isDuplicate?: boolean;
  errorId?: string;
  inputProps?: Partial<ColumnNameInputFieldProps>;
}): ColumnNameInputProps["field"] => ({
  isDuplicate: opts.isDuplicate ?? false,
  errorId: opts.errorId ?? "err-1",
  getInputProps: () => makeInputProps(opts.inputProps),
});

/**
 * ColumnNameInput をレンダリングする。
 * @param props - ColumnNameInputProps
 */
const render = (props: ColumnNameInputProps) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ColumnNameInput, props));
  });
};

test("getInputProps の value/aria-label が input に spread され、個別 props も反映される", () => {
  render({
    field: makeField({ inputProps: { value: "Todo" } }),
    className: "my-input-class",
    dataTestId: "column-rename-input",
    placeholder: "カラム名",
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  expect(input.value).toBe("Todo");
  expect(input.getAttribute("aria-label")).toBe("カラム名");
  expect(input.className).toBe("my-input-class");
  expect(input.getAttribute("data-testid")).toBe("column-rename-input");
  expect(input.getAttribute("placeholder")).toBe("カラム名");
});

test("getInputProps().disabled=true で input が disabled になる", () => {
  render({
    field: makeField({ inputProps: { disabled: true } }),
    className: "c",
    dataTestId: "add-column-input",
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  expect(input.disabled).toBe(true);
});

test("isDuplicate=true でエラー <p> が表示され aria-invalid/aria-describedby が付く", () => {
  render({
    field: makeField({
      isDuplicate: true,
      errorId: "dup-err",
      inputProps: {
        "aria-invalid": true,
        "aria-describedby": "dup-err",
      },
    }),
    className: "c",
    dataTestId: "column-rename-input",
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe("dup-err");
  const alert = container?.querySelector('[role="alert"]');
  expect(alert?.id).toBe("dup-err");
  expect(alert?.textContent).toContain("同じ名前のカラムが既に存在します");
});

test("isDuplicate=false ではエラー <p> 非表示・aria-describedby 未設定", () => {
  render({
    field: makeField({ isDuplicate: false }),
    className: "c",
    dataTestId: "column-rename-input",
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  expect(input.getAttribute("aria-describedby")).toBeNull();
  expect(container?.querySelector('[role="alert"]')).toBeNull();
});

test("dndDisabled=true で data-column-dnd-disabled が付く", () => {
  render({
    field: makeField({}),
    className: "c",
    dataTestId: "column-rename-input",
    dndDisabled: true,
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  expect(input.hasAttribute("data-column-dnd-disabled")).toBe(true);
});

test("dndDisabled 未指定で data-column-dnd-disabled は付かない", () => {
  render({
    field: makeField({}),
    className: "c",
    dataTestId: "add-column-input",
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  expect(input.hasAttribute("data-column-dnd-disabled")).toBe(false);
});

test("getInputProps 由来の onChange/onKeyDown/onBlur が対応イベントで呼ばれる", () => {
  const onChange = vi.fn();
  const onKeyDown = vi.fn();
  const onBlur = vi.fn();
  render({
    field: makeField({ inputProps: { onChange, onKeyDown, onBlur } }),
    className: "c",
    dataTestId: "add-column-input",
  });
  const input = container?.querySelector("input") as HTMLInputElement;
  // React 制御 input は tracked value と異なる時のみ onChange が発火するため、
  // native setter で値を変えてから input イベントを送る（既存テストと同方式）。
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    nativeSetter?.call(input, "x");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  // React 19 のルート委譲は blur を focusout として拾う。
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalled();
  expect(onKeyDown).toHaveBeenCalled();
  expect(onBlur).toHaveBeenCalled();
});
