import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { LabelInput } from "..";

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

const render = (props: Parameters<typeof LabelInput>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LabelInput, props));
  });
};

const baseProps = (
  overrides: Partial<Parameters<typeof LabelInput>[0]> = {},
): Parameters<typeof LabelInput>[0] => ({
  id: "labels",
  value: "",
  onChange: vi.fn(),
  onKeyDown: vi.fn(),
  onBlur: vi.fn(),
  candidates: ["bug", "feature"],
  onSelect: vi.fn(),
  ...overrides,
});

const input = (): HTMLInputElement =>
  document.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;

const listbox = (): HTMLElement | null =>
  document.querySelector("[data-testid='task-form-label-suggest']");

const focusInput = () => {
  act(() => {
    input().focus();
    input().dispatchEvent(new Event("focus", { bubbles: true }));
  });
};

test("focus で listbox が表示され candidates 全件が option として描画される", () => {
  render(baseProps());
  expect(listbox()).toBeNull();
  focusInput();
  const list = listbox();
  expect(list?.getAttribute("role")).toBe("listbox");
  const options = Array.from(list?.querySelectorAll("[role='option']") ?? []);
  expect(options.map((o) => o.textContent)).toEqual(["bug", "feature"]);
  expect(input().getAttribute("aria-expanded")).toBe("true");
});

test("input に combobox の ARIA 属性（role / aria-controls）が付与される", () => {
  render(baseProps());
  focusInput();
  expect(input().getAttribute("role")).toBe("combobox");
  const controls = input().getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  expect(listbox()?.id).toBe(controls);
});

test("candidates が空なら focus してもリストを表示しない（aria-expanded=false）", () => {
  render(baseProps({ candidates: [] }));
  focusInput();
  expect(listbox()).toBeNull();
  expect(input().getAttribute("aria-expanded")).toBe("false");
});

test("candidates 未指定（従来利用）でも素の input として動作する", () => {
  render(baseProps({ candidates: undefined, onSelect: undefined }));
  focusInput();
  expect(listbox()).toBeNull();
});

const keydown = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
};

test("候補クリックで onSelect が呼ばれリストが閉じる", () => {
  const onSelect = vi.fn();
  render(baseProps({ onSelect }));
  focusInput();
  const option = document.querySelector(
    "[data-testid='task-form-label-suggest-option-bug']",
  ) as HTMLButtonElement;
  act(() => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
  expect(onSelect).toHaveBeenCalledWith("bug");
  expect(listbox()).toBeNull();
});

test("候補の mousedown は preventDefault され input のフォーカスを奪わない", () => {
  render(baseProps());
  focusInput();
  const option = document.querySelector(
    "[data-testid='task-form-label-suggest-option-bug']",
  ) as HTMLButtonElement;
  const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  act(() => {
    option.dispatchEvent(ev);
  });
  expect(ev.defaultPrevented).toBe(true);
});

test("リスト表示中に外側を mousedown するとリストだけ閉じる（確定しない）", () => {
  const onSelect = vi.fn();
  render(baseProps({ onSelect }));
  focusInput();
  expect(listbox()).toBeTruthy();
  act(() => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(listbox()).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

test("ArrowDown でハイライトが移動し aria-selected が追従する", () => {
  render(baseProps());
  focusInput();
  keydown("ArrowDown");
  const selected = () =>
    Array.from(document.querySelectorAll("[role='option']")).map((o) =>
      o.getAttribute("aria-selected"),
    );
  expect(selected()).toEqual(["true", "false"]);
  keydown("ArrowDown");
  expect(selected()).toEqual(["false", "true"]);
});

test("ハイライトありの Enter はハイライト候補で onSelect が呼ばれ、自由入力 commit の onKeyDown は走らない", () => {
  const onSelect = vi.fn();
  const onKeyDown = vi.fn();
  render(baseProps({ onSelect, onKeyDown }));
  focusInput();
  keydown("ArrowDown");
  keydown("Enter");
  expect(onSelect).toHaveBeenCalledWith("bug");
  expect(onKeyDown).not.toHaveBeenCalled();
  expect(listbox()).toBeNull();
});

test("ハイライトなしの Enter は props.onKeyDown へ委譲される（自由入力 commit の従来動作）", () => {
  const onSelect = vi.fn();
  const onKeyDown = vi.fn();
  render(baseProps({ onSelect, onKeyDown }));
  focusInput();
  keydown("Enter");
  expect(onKeyDown).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
});

test("IME 変換中（isComposing）の Enter はハイライトがあっても onSelect しない", () => {
  const onSelect = vi.fn();
  render(baseProps({ onSelect }));
  focusInput();
  keydown("ArrowDown");
  keydown("Enter", { isComposing: true });
  expect(onSelect).not.toHaveBeenCalled();
});

test("リスト表示中の Esc はリストだけ閉じ、document のリスナーまでイベントが届かない", () => {
  const documentListener = vi.fn();
  document.addEventListener("keydown", documentListener);
  render(baseProps());
  focusInput();
  expect(listbox()).toBeTruthy();
  keydown("Escape");
  expect(listbox()).toBeNull();
  expect(documentListener).not.toHaveBeenCalled();
  document.removeEventListener("keydown", documentListener);
});

test("リスト非表示の Esc は伝播を遮断しない（document のリスナーへ届く）", () => {
  const documentListener = vi.fn();
  document.addEventListener("keydown", documentListener);
  render(baseProps({ candidates: [] }));
  focusInput();
  keydown("Escape");
  expect(documentListener).toHaveBeenCalledTimes(1);
  document.removeEventListener("keydown", documentListener);
});

test("ArrowUp でハイライトが後退し、先頭からさらに ArrowUp でハイライト解除に戻る", () => {
  render(baseProps());
  focusInput();
  keydown("ArrowDown");
  keydown("ArrowDown");
  const selected = () =>
    Array.from(document.querySelectorAll("[role='option']")).map((o) =>
      o.getAttribute("aria-selected"),
    );
  expect(selected()).toEqual(["false", "true"]);
  keydown("ArrowUp");
  expect(selected()).toEqual(["true", "false"]);
  keydown("ArrowUp");
  expect(selected()).toEqual(["false", "false"]);
});

test("Esc で閉じた後の ArrowDown でリストが再オープンする", () => {
  render(baseProps());
  focusInput();
  keydown("Escape");
  expect(listbox()).toBeNull();
  keydown("ArrowDown");
  expect(listbox()).toBeTruthy();
});

test("末尾候補で ArrowDown してもハイライトは末尾に留まる（クランプ）", () => {
  render(baseProps());
  focusInput();
  keydown("ArrowDown");
  keydown("ArrowDown");
  keydown("ArrowDown");
  const selected = Array.from(document.querySelectorAll("[role='option']")).map(
    (o) => o.getAttribute("aria-selected"),
  );
  expect(selected).toEqual(["false", "true"]);
});

test("Esc で閉じた後も入力変更でリストが再表示される", () => {
  const onChange = vi.fn();
  render(baseProps({ onChange }));
  focusInput();
  keydown("Escape");
  expect(listbox()).toBeNull();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input(), "b");
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(listbox()).toBeTruthy();
});
