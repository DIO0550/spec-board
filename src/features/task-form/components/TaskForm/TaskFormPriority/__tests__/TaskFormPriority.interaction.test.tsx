import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormPriority } from "..";

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

const render = (props: Parameters<typeof TaskFormPriority>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormPriority, props));
  });
};

const changeValue = (select: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

test("value='' で「なし」が選択状態、High/Medium/Low option も存在", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  const select = container?.querySelector(
    "[data-testid='task-form-priority']",
  ) as HTMLSelectElement;
  expect(select.value).toBe("");
  const options = Array.from(select.querySelectorAll("option")).map(
    (o) => o.value,
  );
  expect(options).toEqual(["", "High", "Medium", "Low"]);
});

test("High を選択で onChange('High') が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: false });
  const select = container?.querySelector(
    "[data-testid='task-form-priority']",
  ) as HTMLSelectElement;
  act(() => {
    changeValue(select, "High");
  });
  expect(onChange).toHaveBeenCalledWith("High");
});

test("空文字を選択で onChange('') が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "High", onChange, disabled: false });
  const select = container?.querySelector(
    "[data-testid='task-form-priority']",
  ) as HTMLSelectElement;
  act(() => {
    changeValue(select, "");
  });
  expect(onChange).toHaveBeenCalledWith("");
});

test("disabled=true で select が disabled", () => {
  render({ value: "", onChange: vi.fn(), disabled: true });
  const select = container?.querySelector(
    "[data-testid='task-form-priority']",
  ) as HTMLSelectElement;
  expect(select.disabled).toBe(true);
});
