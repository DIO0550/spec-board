import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ChipRadioGroup } from "..";

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

const render = (props: Parameters<typeof ChipRadioGroup>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ChipRadioGroup, props));
  });
};

const OPTIONS = [
  { value: "Todo", label: "Todo" },
  { value: "Doing", label: "Doing" },
  { value: "Done", label: "Done" },
];

const baseProps = (
  overrides: Partial<Parameters<typeof ChipRadioGroup>[0]> = {},
): Parameters<typeof ChipRadioGroup>[0] => ({
  label: "ステータス",
  options: OPTIONS,
  value: "Todo",
  onChange: vi.fn(),
  disabled: false,
  "data-testid": "chip-group",
  ...overrides,
});

const chips = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll("[role='radio']"));

test("options 全件が role=radio のチップとして描画され、value のチップだけ aria-checked=true になる", () => {
  render(baseProps({ value: "Doing" }));
  const group = document.querySelector("[role='radiogroup']");
  expect(group).toBeTruthy();
  const items = chips();
  expect(items.length).toBe(3);
  expect(items.map((c) => c.getAttribute("aria-checked"))).toEqual([
    "false",
    "true",
    "false",
  ]);
});

test("非選択チップのクリックで onChange がそのチップの value で 1 回呼ばれる", () => {
  const onChange = vi.fn();
  render(baseProps({ onChange }));
  const done = document.querySelector(
    "[data-testid='chip-group-chip-Done']",
  ) as HTMLButtonElement;
  act(() => {
    done.click();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith("Done");
});

test("グループのラベルテキストが radiogroup と aria-labelledby で関連付く", () => {
  render(baseProps());
  const group = document.querySelector("[role='radiogroup']");
  const labelId = group?.getAttribute("aria-labelledby");
  expect(labelId).toBeTruthy();
  const label = document.getElementById(labelId ?? "");
  expect(label?.textContent).toContain("ステータス");
});

test("required=true でラベルに必須マーク（*）が表示される", () => {
  render(baseProps({ required: true }));
  const group = document.querySelector("[role='radiogroup']");
  const labelId = group?.getAttribute("aria-labelledby");
  const label = document.getElementById(labelId ?? "");
  expect(label?.textContent).toContain("*");
});

const keydownOn = (el: HTMLElement, key: string) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

test.each([
  ["ArrowRight", "Done"],
  ["ArrowDown", "Done"],
  ["ArrowLeft", "Todo"],
  ["ArrowUp", "Todo"],
])("選択中チップで %s keydown すると隣の選択肢 %s で onChange が呼ばれる", (key, expected) => {
  const onChange = vi.fn();
  render(baseProps({ value: "Doing", onChange }));
  const current = document.querySelector(
    "[data-testid='chip-group-chip-Doing']",
  ) as HTMLButtonElement;
  act(() => {
    keydownOn(current, key);
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(expected);
});

test.each([
  ["先頭で ArrowLeft は末尾へ循環する", "Todo", "ArrowLeft", "Done"],
  ["末尾で ArrowRight は先頭へ循環する", "Done", "ArrowRight", "Todo"],
])("%s", (_label, value, key, expected) => {
  const onChange = vi.fn();
  render(baseProps({ value, onChange }));
  const current = document.querySelector(
    `[data-testid='chip-group-chip-${value}']`,
  ) as HTMLButtonElement;
  act(() => {
    keydownOn(current, key);
  });
  expect(onChange).toHaveBeenCalledWith(expected);
});

test("roving tabIndex: 選択中チップのみ tabIndex=0、他は -1 になる", () => {
  render(baseProps({ value: "Doing" }));
  expect(chips().map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
});

test("accentColor 付き option は選択中チップの style に色が反映される", () => {
  render(
    baseProps({
      value: "Todo",
      options: [
        { value: "Todo", label: "Todo", accentColor: "#ff0000" },
        { value: "Done", label: "Done", accentColor: "#00ff00" },
      ],
    }),
  );
  const selected = document.querySelector(
    "[data-testid='chip-group-chip-Todo']",
  ) as HTMLButtonElement;
  expect(selected.style.borderColor).toBe("#ff0000");
});

test("option の className がチップに付与される", () => {
  render(
    baseProps({
      options: [
        { value: "Todo", label: "Todo", className: "bg-red-100" },
        { value: "Done", label: "Done" },
      ],
    }),
  );
  const chip = document.querySelector(
    "[data-testid='chip-group-chip-Todo']",
  ) as HTMLButtonElement;
  expect(chip.className).toContain("bg-red-100");
});

test("disabled=true 中のクリックでは onChange が呼ばれない", () => {
  const onChange = vi.fn();
  render(baseProps({ onChange, disabled: true }));
  const done = document.querySelector(
    "[data-testid='chip-group-chip-Done']",
  ) as HTMLButtonElement;
  expect(done.disabled).toBe(true);
  act(() => {
    done.click();
  });
  expect(onChange).not.toHaveBeenCalled();
});
