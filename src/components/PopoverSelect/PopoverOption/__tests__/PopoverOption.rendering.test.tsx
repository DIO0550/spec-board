import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { PopoverOption } from "..";

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
  overrides: Partial<Parameters<typeof PopoverOption>[0]> = {},
): Parameters<typeof PopoverOption>[0] => ({
  option: { value: "Doing", label: "Doing", swatchColor: "#222222" },
  optionId: "lb-option-1",
  testId: "ps-option-Doing",
  selected: false,
  active: false,
  onMouseEnter: vi.fn(),
  onSelect: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof PopoverOption>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PopoverOption, props));
  });
};

const button = (): HTMLButtonElement =>
  container?.querySelector("button") as HTMLButtonElement;
const swatch = () => container?.querySelector("span[style]") ?? null;
const badge = () => container?.querySelector(".font-semibold") ?? null;
const label = () => container?.querySelector(".truncate") ?? null;

test("swatch + label: button 直下に swatch と flex-1 truncate label が並ぶ", () => {
  render(baseProps());
  expect(swatch()?.getAttribute("style")).toContain("#222222");
  expect(label()?.textContent).toBe("Doing");
  expect(label()?.className).toContain("flex-1");
  expect(label()?.className).toContain("truncate");
});

test("badge のみ: badge が描画され swatch なし", () => {
  render(
    baseProps({
      option: { value: "High", label: "High", badgeClassName: "bg-red-100" },
    }),
  );
  expect(badge()?.textContent).toBe("High");
  expect(swatch()).toBeNull();
});

test("label のみ: truncate label のみで swatch なし", () => {
  render(baseProps({ option: { value: "None", label: "None" } }));
  expect(label()?.textContent).toBe("None");
  expect(swatch()).toBeNull();
});

test("button 属性（id / role / data-testid / aria-selected）が反映される", () => {
  render(
    baseProps({
      optionId: "lb-option-2",
      testId: "ps-option-x",
      selected: true,
    }),
  );
  expect(button().id).toBe("lb-option-2");
  expect(button().getAttribute("role")).toBe("option");
  expect(button().getAttribute("data-testid")).toBe("ps-option-x");
  expect(button().getAttribute("aria-selected")).toBe("true");
});

test("selected=true で font-medium が付く", () => {
  render(baseProps({ selected: true }));
  expect(button().className).toContain("font-medium");
});

test.each([
  [true, "bg-panel-2", false],
  [false, "hover:bg-panel-2", true],
])("active=%s で %s が付く", (active, expectedClass, notPlainBg) => {
  render(baseProps({ active }));
  expect(button().className).toContain(expectedClass);
  expect(button().className.includes("hover:bg-panel-2")).toBe(notPlainBg);
});

test("swatch + badge 同時: badge 優先で swatch を出さない", () => {
  render(
    baseProps({
      option: {
        value: "High",
        label: "High",
        swatchColor: "#222222",
        badgeClassName: "bg-red-100",
      },
    }),
  );
  expect(badge()?.textContent).toBe("High");
  expect(swatch()).toBeNull();
});

test("click で onSelect が 1 回呼ばれる", () => {
  const onSelect = vi.fn();
  render(baseProps({ onSelect }));
  act(() => {
    button().click();
  });
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test("mouseover で onMouseEnter が 1 回呼ばれる", () => {
  const onMouseEnter = vi.fn();
  render(baseProps({ onMouseEnter }));
  act(() => {
    button().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  expect(onMouseEnter).toHaveBeenCalledTimes(1);
});
