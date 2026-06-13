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

test("なし / High / Medium / Low の 4 チップが radiogroup で描画される", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  const group = document.querySelector(
    "[data-testid='task-form-priority'][role='radiogroup']",
  );
  expect(group).toBeTruthy();
  const chips = Array.from(group?.querySelectorAll("[role='radio']") ?? []).map(
    (c) => c.textContent,
  );
  expect(chips).toEqual(["なし", "High", "Medium", "Low"]);
});

test("value='' で「なし」チップが選択状態になる", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  const none = document.querySelector(
    "[data-testid='task-form-priority-chip-']",
  ) as HTMLButtonElement;
  expect(none.getAttribute("aria-checked")).toBe("true");
});

test("High チップのクリックで onChange('High') が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: false });
  const high = document.querySelector(
    "[data-testid='task-form-priority-chip-High']",
  ) as HTMLButtonElement;
  act(() => {
    high.click();
  });
  expect(onChange).toHaveBeenCalledWith("High");
});

test("value='High' で「なし」チップのクリックで onChange('') が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "High", onChange, disabled: false });
  const none = document.querySelector(
    "[data-testid='task-form-priority-chip-']",
  ) as HTMLButtonElement;
  act(() => {
    none.click();
  });
  expect(onChange).toHaveBeenCalledWith("");
});

test.each([
  ["High", "bg-red-100"],
  ["Medium", "bg-yellow-100"],
  ["Low", "bg-blue-100"],
])("%s チップに %s 系の配色クラスが付与される", (priority, expectedClass) => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  const chip = document.querySelector(
    `[data-testid='task-form-priority-chip-${priority}']`,
  ) as HTMLButtonElement;
  expect(chip.className).toContain(expectedClass);
});

test("disabled=true で全チップが disabled になり onChange が呼ばれない", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: true });
  const chips = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[role='radio']"),
  );
  expect(chips.every((c) => c.disabled)).toBe(true);
  act(() => {
    chips[1]?.click();
  });
  expect(onChange).not.toHaveBeenCalled();
});
