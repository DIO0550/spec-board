import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { PriorityField } from "..";

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

const baseProps = (
  overrides: Partial<Parameters<typeof PriorityField>[0]> = {},
): Parameters<typeof PriorityField>[0] => ({
  value: undefined,
  onChange: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof PriorityField>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PriorityField, props));
  });
};

const trigger = (): HTMLButtonElement =>
  document.querySelector('[data-testid="priority-field"]') as HTMLButtonElement;

const openPopover = () => {
  act(() => {
    trigger().click();
  });
};

test("未選択（undefined）は trigger に「なし」を表示する", () => {
  render(baseProps({ value: undefined }));
  expect(trigger().textContent).toContain("なし");
});

test("選択済みは trigger にその優先度を表示する", () => {
  render(baseProps({ value: "High" }));
  expect(trigger().textContent).toContain("High");
});

test("option 選択で onChange がその優先度で呼ばれる", () => {
  const onChange = vi.fn();
  render(baseProps({ value: undefined, onChange }));
  openPopover();
  act(() => {
    (
      document.querySelector(
        '[data-testid="priority-field-option-Medium"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onChange).toHaveBeenCalledWith("Medium");
});

test("「なし」選択で onChange が undefined で呼ばれる", () => {
  const onChange = vi.fn();
  render(baseProps({ value: "High", onChange }));
  openPopover();
  act(() => {
    (
      document.querySelector(
        '[data-testid="priority-field-option-"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test("disabled では popover を開かない", () => {
  render(baseProps({ disabled: true }));
  expect(trigger().disabled).toBe(true);
  openPopover();
  expect(
    document.querySelector('[data-testid="priority-field-listbox"]'),
  ).toBeNull();
});
