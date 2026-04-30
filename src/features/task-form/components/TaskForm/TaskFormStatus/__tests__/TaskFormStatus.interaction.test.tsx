import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
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
  { name: "Done", order: 1 },
];

test("select と columns 分の option が描画され value が反映される", () => {
  render({ columns, value: "Todo", onChange: vi.fn(), disabled: false });
  const select = container?.querySelector(
    "[data-testid='task-form-status']",
  ) as HTMLSelectElement;
  expect(select).toBeTruthy();
  expect(select.value).toBe("Todo");
  expect(select.querySelectorAll("option").length).toBe(2);
});

test("select 変更で onChange が呼ばれる", () => {
  const onChange = vi.fn();
  render({ columns, value: "Todo", onChange, disabled: false });
  const select = container?.querySelector(
    "[data-testid='task-form-status']",
  ) as HTMLSelectElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, "Done");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("Done");
});

test("disabled=true で select が disabled", () => {
  render({ columns, value: "Todo", onChange: vi.fn(), disabled: true });
  const select = container?.querySelector(
    "[data-testid='task-form-status']",
  ) as HTMLSelectElement;
  expect(select.disabled).toBe(true);
});
