import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import { StatusField } from "..";

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

const COLUMNS: Column[] = [
  { name: "Todo", order: 0, color: "#3b82f6" },
  { name: "Doing", order: 1, color: "#f59e0b" },
];

const baseProps = (
  overrides: Partial<Parameters<typeof StatusField>[0]> = {},
): Parameters<typeof StatusField>[0] => ({
  columns: COLUMNS,
  value: "Todo",
  onChange: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof StatusField>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(StatusField, props));
  });
};

const trigger = (): HTMLButtonElement =>
  document.querySelector('[data-testid="status-field"]') as HTMLButtonElement;

const openPopover = () => {
  act(() => {
    trigger().click();
  });
};

test("columns から option を生成する", () => {
  render(baseProps());
  openPopover();
  const options = Array.from(
    document.querySelectorAll('[data-testid^="status-field-option-"]'),
  );
  expect(options.map((o) => o.textContent)).toEqual(["Todo", "Doing"]);
});

test("現在値を trigger に表示する", () => {
  render(baseProps({ value: "Doing" }));
  expect(trigger().textContent).toContain("Doing");
});

test("option 選択で onChange がそのカラム名で呼ばれる", () => {
  const onChange = vi.fn();
  render(baseProps({ value: "Doing", onChange }));
  openPopover();
  act(() => {
    (
      document.querySelector(
        '[data-testid="status-field-option-Todo"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onChange).toHaveBeenCalledWith("Todo");
});

test("value が columns に無くても例外を出さず trigger を描画する", () => {
  render(baseProps({ value: "Unknown" }));
  expect(trigger()).toBeTruthy();
});

test("disabled 未指定なら popover を開ける", () => {
  render(baseProps());
  openPopover();
  expect(
    document.querySelector('[data-testid="status-field-listbox"]'),
  ).toBeTruthy();
});
