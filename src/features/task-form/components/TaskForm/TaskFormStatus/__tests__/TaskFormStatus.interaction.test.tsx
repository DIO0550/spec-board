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

const openStatus = () => {
  const trigger = document.querySelector(
    "[data-testid='task-form-status']",
  ) as HTMLButtonElement;
  act(() => {
    trigger.click();
  });
};

test("現在値が status trigger（listbox 開閉ボタン）に表示される", () => {
  render({ columns, value: "Doing", onChange: vi.fn(), disabled: false });
  const trigger = document.querySelector(
    "[data-testid='task-form-status'][aria-haspopup='listbox']",
  );
  expect(trigger?.textContent).toContain("Doing");
});

test("開くと columns 全件が option として描画され value が aria-selected になる", () => {
  render({ columns, value: "Doing", onChange: vi.fn(), disabled: false });
  openStatus();
  const options = Array.from(document.querySelectorAll("[role='option']"));
  expect(options.map((o) => o.textContent)).toEqual(["Todo", "Doing", "Done"]);
  expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual([
    "false",
    "true",
    "false",
  ]);
});

test("option のクリックで onChange がその column 名で呼ばれる", () => {
  const onChange = vi.fn();
  render({ columns, value: "Todo", onChange, disabled: false });
  openStatus();
  const done = document.querySelector(
    "[data-testid='task-form-status-option-Done']",
  ) as HTMLButtonElement;
  act(() => {
    done.click();
  });
  expect(onChange).toHaveBeenCalledWith("Done");
});

test("color 指定ありの option の swatch に resolveAccent の色が反映される", () => {
  render({ columns, value: "Todo", onChange: vi.fn(), disabled: false });
  openStatus();
  const option = document.querySelector(
    "[data-testid='task-form-status-option-Doing']",
  ) as HTMLButtonElement;
  const swatch = option.querySelector("span[style]") as HTMLElement;
  expect(swatch.style.backgroundColor).toBe(
    ColumnColor.resolveAccent("#ff0000", 1),
  );
});

test("color 未設定の option は order フォールバックの accent が swatch に使われる", () => {
  render({ columns, value: "Todo", onChange: vi.fn(), disabled: false });
  openStatus();
  const option = document.querySelector(
    "[data-testid='task-form-status-option-Todo']",
  ) as HTMLButtonElement;
  const swatch = option.querySelector("span[style]") as HTMLElement;
  expect(swatch.style.backgroundColor).toBe(
    ColumnColor.resolveAccent(undefined, 0),
  );
});

test("disabled=true では trigger が無効化され popover が開かない", () => {
  const onChange = vi.fn();
  render({ columns, value: "Todo", onChange, disabled: true });
  const trigger = document.querySelector(
    "[data-testid='task-form-status']",
  ) as HTMLButtonElement;
  expect(trigger.disabled).toBe(true);
  openStatus();
  expect(
    document.querySelector("[data-testid='task-form-status-listbox']"),
  ).toBeNull();
});
