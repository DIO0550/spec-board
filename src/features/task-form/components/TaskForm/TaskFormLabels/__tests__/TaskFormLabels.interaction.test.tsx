import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormLabels } from "..";
import { LabelChip } from "../LabelChip";
import { LabelInput } from "../LabelInput";

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
  labels?: string[];
  labelInput?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  onRemove?: (label: string) => void;
};

const render = (opts: RenderOptions = {}) => {
  const {
    labels = [],
    labelInput = "",
    disabled = false,
    onChange = vi.fn(),
    onKeyDown = vi.fn(),
    onBlur = vi.fn(),
    onRemove = vi.fn(),
  } = opts;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        TaskFormLabels,
        { disabled },
        ...labels.map((label) =>
          createElement(LabelChip, {
            key: label,
            label,
            onRemove: () => onRemove(label),
          }),
        ),
        createElement(LabelInput, {
          value: labelInput,
          onChange,
          onKeyDown,
          onBlur,
        }),
      ),
    );
  });
};

test("labels=['a'] で chip と × ボタン、input が描画される", () => {
  render({ labels: ["a"] });
  const chipBtn = container?.querySelector(
    "button[aria-label='ラベル「a」を削除']",
  );
  expect(chipBtn).toBeTruthy();
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  );
  expect(input).toBeTruthy();
});

test("input 入力で onChange が呼ばれる", () => {
  const onChange = vi.fn();
  render({ onChange });
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
  expect(onChange).toHaveBeenCalledWith("b");
});

test("Enter キーで onKeyDown が呼ばれる", () => {
  const onKeyDown = vi.fn();
  render({ onKeyDown });
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

test("input blur で onBlur が呼ばれる", () => {
  const onBlur = vi.fn();
  render({ onBlur });
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  act(() => {
    input.focus();
  });
  act(() => {
    input.blur();
  });
  expect(onBlur).toHaveBeenCalledTimes(1);
});

test("× ボタン click で onRemove(label) が呼ばれる", () => {
  const onRemove = vi.fn();
  render({ labels: ["a"], onRemove });
  const btn = container?.querySelector(
    "button[aria-label='ラベル「a」を削除']",
  ) as HTMLButtonElement;
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onRemove).toHaveBeenCalledWith("a");
});

test("disabled=true で input と × ボタンが両方 disabled（context 経由で伝播）", () => {
  render({ labels: ["a"], disabled: true });
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  const btn = container?.querySelector(
    "button[aria-label='ラベル「a」を削除']",
  ) as HTMLButtonElement;
  expect(input.disabled).toBe(true);
  expect(btn.disabled).toBe(true);
});

test("label の htmlFor と input の id が一致する（useId + context 経由）", () => {
  render({ labels: [] });
  const labelEl = container?.querySelector("label") as HTMLLabelElement;
  const input = container?.querySelector(
    "[data-testid='task-form-label-input']",
  ) as HTMLInputElement;
  expect(labelEl.htmlFor).toBe(input.id);
  expect(input.id.length).toBeGreaterThan(0);
});
