import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ColumnColor } from "@/domains/column-color";
import type { Column } from "@/types/column";
import { TaskFormStatus } from "..";

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

const render = (props: Parameters<typeof TaskFormStatus>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormStatus, props));
  });
};

const columns: Column[] = [
  { name: "Todo", order: 0 },
  { name: "Doing", order: 1, color: "#ff0000" },
  { name: "Done", order: 2 },
];

test("columns 全件がチップとして描画され radiogroup でグループ化される", () => {
  render({ columns, value: "Todo", onChange: vi.fn(), disabled: false });
  const group = document.querySelector(
    "[data-testid='task-form-status'][role='radiogroup']",
  );
  expect(group).toBeTruthy();
  const chips = Array.from(group?.querySelectorAll("[role='radio']") ?? []).map(
    (c) => c.textContent,
  );
  expect(chips).toEqual(["Todo", "Doing", "Done"]);
});

test("value のチップだけが aria-checked=true になる", () => {
  render({ columns, value: "Doing", onChange: vi.fn(), disabled: false });
  const checked = Array.from(document.querySelectorAll("[role='radio']")).map(
    (c) => c.getAttribute("aria-checked"),
  );
  expect(checked).toEqual(["false", "true", "false"]);
});

test("チップのクリックで onChange がその column 名で呼ばれる", () => {
  const onChange = vi.fn();
  render({ columns, value: "Todo", onChange, disabled: false });
  const done = document.querySelector(
    "[data-testid='task-form-status-chip-Done']",
  ) as HTMLButtonElement;
  act(() => {
    done.click();
  });
  expect(onChange).toHaveBeenCalledWith("Done");
});

test("color 指定ありの選択中チップに resolveAccent の色が反映される", () => {
  render({ columns, value: "Doing", onChange: vi.fn(), disabled: false });
  const chip = document.querySelector(
    "[data-testid='task-form-status-chip-Doing']",
  ) as HTMLButtonElement;
  expect(chip.style.borderColor).toBe(ColumnColor.resolveAccent("#ff0000", 1));
});

test("color 未設定の選択中チップは order フォールバックの accent が使われる", () => {
  render({ columns, value: "Todo", onChange: vi.fn(), disabled: false });
  const chip = document.querySelector(
    "[data-testid='task-form-status-chip-Todo']",
  ) as HTMLButtonElement;
  expect(chip.style.borderColor).toBe(ColumnColor.resolveAccent(undefined, 0));
});

test("disabled=true で全チップが disabled になり onChange が呼ばれない", () => {
  const onChange = vi.fn();
  render({ columns, value: "Todo", onChange, disabled: true });
  const chips = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[role='radio']"),
  );
  expect(chips.every((c) => c.disabled)).toBe(true);
  act(() => {
    chips[2]?.click();
  });
  expect(onChange).not.toHaveBeenCalled();
});
