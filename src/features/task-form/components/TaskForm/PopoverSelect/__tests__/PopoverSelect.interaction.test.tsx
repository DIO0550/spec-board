import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { PopoverSelect } from "..";

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

const OPTIONS = [
  { value: "Todo", label: "Todo", swatchColor: "#111111" },
  { value: "Doing", label: "Doing", swatchColor: "#222222" },
  { value: "Done", label: "Done", swatchColor: "#333333" },
];

const baseProps = (
  overrides: Partial<Parameters<typeof PopoverSelect>[0]> = {},
): Parameters<typeof PopoverSelect>[0] => ({
  label: "ステータス",
  options: OPTIONS,
  value: "Todo",
  onChange: vi.fn(),
  disabled: false,
  "data-testid": "ps",
  ...overrides,
});

const render = (props: Parameters<typeof PopoverSelect>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PopoverSelect, props));
  });
};

const trigger = (): HTMLButtonElement =>
  document.querySelector('[data-testid="ps"]') as HTMLButtonElement;

const openPopover = () => {
  act(() => {
    trigger().click();
  });
};

const keydownOn = (el: Element, key: string) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

test("初期値が trigger に label + swatch で表示される", () => {
  render(baseProps({ value: "Doing" }));
  expect(trigger().textContent).toContain("Doing");
  expect(trigger().querySelector("span[style]")).toBeTruthy();
});

test("trigger は aria-haspopup=listbox を持ち、開くと listbox / option の role 構造になる", () => {
  render(baseProps());
  expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  openPopover();
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector('[data-testid="ps-listbox"]')).toBeTruthy();
  const options = document.querySelectorAll('[role="option"]');
  expect(options.length).toBe(3);
  expect(
    Array.from(options).map((o) => o.getAttribute("aria-selected")),
  ).toEqual(["true", "false", "false"]);
});

test("option クリックで onChange がその value で 1 回呼ばれ popover が閉じる", () => {
  const onChange = vi.fn();
  render(baseProps({ onChange }));
  openPopover();
  const done = document.querySelector(
    '[data-testid="ps-option-Done"]',
  ) as HTMLButtonElement;
  act(() => {
    done.click();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith("Done");
  expect(document.querySelector('[data-testid="ps-listbox"]')).toBeNull();
});

test("ArrowDown→Enter で次の option が選択される", () => {
  const onChange = vi.fn();
  render(baseProps({ value: "Todo", onChange }));
  openPopover();
  const listbox = document.querySelector(
    '[data-testid="ps-listbox"]',
  ) as HTMLElement;
  act(() => {
    keydownOn(listbox, "ArrowDown");
  });
  act(() => {
    keydownOn(listbox, "Enter");
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith("Doing");
});

test.each([
  ["End", "Done"],
  ["Home", "Todo"],
])("%s で highlight が端へ移動し Enter で %s が選択される", (key, expected) => {
  const onChange = vi.fn();
  render(baseProps({ value: "Doing", onChange }));
  openPopover();
  const listbox = document.querySelector(
    '[data-testid="ps-listbox"]',
  ) as HTMLElement;
  act(() => {
    keydownOn(listbox, key);
  });
  act(() => {
    keydownOn(listbox, "Enter");
  });
  expect(onChange).toHaveBeenCalledWith(expected);
});

test("末尾で ArrowDown は先頭へ循環する", () => {
  const onChange = vi.fn();
  render(baseProps({ value: "Done", onChange }));
  openPopover();
  const listbox = document.querySelector(
    '[data-testid="ps-listbox"]',
  ) as HTMLElement;
  act(() => {
    keydownOn(listbox, "ArrowDown");
  });
  act(() => {
    keydownOn(listbox, "Enter");
  });
  expect(onChange).toHaveBeenCalledWith("Todo");
});

test("open 中の Esc は popover のみ閉じ、親（capture 外）の Esc ハンドラへ伝播しない", () => {
  const parentEsc = vi.fn();
  document.addEventListener("keydown", parentEsc);
  render(baseProps());
  openPopover();
  const listbox = document.querySelector(
    '[data-testid="ps-listbox"]',
  ) as HTMLElement;
  act(() => {
    keydownOn(listbox, "Escape");
  });
  expect(document.querySelector('[data-testid="ps-listbox"]')).toBeNull();
  expect(parentEsc).not.toHaveBeenCalled();
  document.removeEventListener("keydown", parentEsc);
});

test("closed 状態の Esc は親の Esc ハンドラへ届く（popover は capture を張らない）", () => {
  const parentEsc = vi.fn();
  document.addEventListener("keydown", parentEsc);
  render(baseProps());
  act(() => {
    keydownOn(document.body, "Escape");
  });
  expect(parentEsc).toHaveBeenCalledTimes(1);
  document.removeEventListener("keydown", parentEsc);
});

test("open 中に popover 外を mousedown すると閉じ、onChange は呼ばれない", () => {
  const onChange = vi.fn();
  render(baseProps({ onChange }));
  openPopover();
  act(() => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(document.querySelector('[data-testid="ps-listbox"]')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

test("disabled=true では trigger クリックで popover が開かない", () => {
  render(baseProps({ disabled: true }));
  expect(trigger().disabled).toBe(true);
  openPopover();
  expect(document.querySelector('[data-testid="ps-listbox"]')).toBeNull();
});
