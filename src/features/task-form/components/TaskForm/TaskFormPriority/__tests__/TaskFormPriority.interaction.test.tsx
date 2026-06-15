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

const openPriority = () => {
  const trigger = document.querySelector(
    "[data-testid='task-form-priority']",
  ) as HTMLButtonElement;
  act(() => {
    trigger.click();
  });
};

test("開くと なし / High / Medium / Low の 4 option が描画される", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  openPriority();
  const options = Array.from(document.querySelectorAll("[role='option']")).map(
    (o) => o.textContent,
  );
  expect(options).toEqual(["なし", "High", "Medium", "Low"]);
});

test("value='' で「なし」option が aria-selected になる", () => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  openPriority();
  const none = document.querySelector(
    "[data-testid='task-form-priority-option-']",
  ) as HTMLButtonElement;
  expect(none.getAttribute("aria-selected")).toBe("true");
});

test("High option のクリックで onChange('High') が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: false });
  openPriority();
  const high = document.querySelector(
    "[data-testid='task-form-priority-option-High']",
  ) as HTMLButtonElement;
  act(() => {
    high.click();
  });
  expect(onChange).toHaveBeenCalledWith("High");
});

test("value='High' で「なし」option のクリックで onChange('') が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "High", onChange, disabled: false });
  openPriority();
  const none = document.querySelector(
    "[data-testid='task-form-priority-option-']",
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
])("%s option の badge に %s 系の配色クラスが付与される", (priority, expectedClass) => {
  render({ value: "", onChange: vi.fn(), disabled: false });
  openPriority();
  const option = document.querySelector(
    `[data-testid='task-form-priority-option-${priority}']`,
  ) as HTMLButtonElement;
  expect(option.innerHTML).toContain(expectedClass);
});

test("disabled=true では trigger が無効化され popover が開かない", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: true });
  const trigger = document.querySelector(
    "[data-testid='task-form-priority']",
  ) as HTMLButtonElement;
  expect(trigger.disabled).toBe(true);
  openPriority();
  expect(
    document.querySelector("[data-testid='task-form-priority-listbox']"),
  ).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
