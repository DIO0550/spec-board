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

const baseProps = (
  overrides: Partial<Parameters<typeof PopoverSelect>[0]> = {},
): Parameters<typeof PopoverSelect>[0] => ({
  label: "ステータス",
  options: [],
  value: "",
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

const listbox = (): HTMLElement | null =>
  document.querySelector('[data-testid="ps-listbox"]');

const openPopover = () => {
  act(() => {
    trigger().click();
  });
};

const keydownOn = (el: Element, key: string) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

test("空配列で開くと listbox は描画されるが option は 0 個", () => {
  render(baseProps());
  openPopover();
  expect(listbox()).toBeTruthy();
  expect(document.querySelectorAll('[role="option"]').length).toBe(0);
});

test.each([
  "Enter",
  " ",
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
])("空配列で %s を押下しても onChange は呼ばれない", (key) => {
  const onChange = vi.fn();
  render(baseProps({ onChange }));
  openPopover();
  act(() => {
    keydownOn(listbox() as HTMLElement, key);
  });
  expect(onChange).not.toHaveBeenCalled();
});

test("空配列で開いても aria-activedescendant は存在しない id を指さない", () => {
  render(baseProps());
  openPopover();
  // 空配列時 activeIndex は範囲外になるため、実在しない option を参照しない。
  expect(listbox()?.getAttribute("aria-activedescendant")).toBeNull();
});

test("空配列で ArrowDown を押しても aria-activedescendant は変化しない", () => {
  render(baseProps());
  openPopover();
  const before = listbox()?.getAttribute("aria-activedescendant");
  act(() => {
    keydownOn(listbox() as HTMLElement, "ArrowDown");
  });
  const after = listbox()?.getAttribute("aria-activedescendant");
  expect(after).toBe(before);
});

test("空配列で Esc を押すと閉じる", () => {
  render(baseProps());
  openPopover();
  act(() => {
    keydownOn(listbox() as HTMLElement, "Escape");
  });
  expect(listbox()).toBeNull();
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

test("空配列で外側 mousedown すると閉じる", () => {
  render(baseProps());
  openPopover();
  act(() => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(listbox()).toBeNull();
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});
