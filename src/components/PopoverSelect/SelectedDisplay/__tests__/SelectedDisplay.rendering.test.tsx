import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import type { PopoverSelectOption } from "../../types";
import { SelectedDisplay } from "..";

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

const render = (option: PopoverSelectOption | undefined) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SelectedDisplay, { option }));
  });
};

const swatch = () => container?.querySelector("span[style]") ?? null;
const badge = () => container?.querySelector(".font-semibold") ?? null;
const wrapper = () => container?.querySelector(".gap-2") ?? null;
const label = () => container?.querySelector(".truncate") ?? null;

test("swatch + label: gap-2 ラッパ内に swatch と truncate label が並ぶ", () => {
  render({ value: "Doing", label: "Doing", swatchColor: "#222222" });
  expect(wrapper()).toBeTruthy();
  expect(swatch()?.getAttribute("style")).toContain("#222222");
  expect(label()?.textContent).toBe("Doing");
});

test("badge のみ: badge が描画され swatch も gap-2 ラッパも付かない", () => {
  render({ value: "High", label: "High", badgeClassName: "bg-red-100" });
  expect(badge()?.textContent).toBe("High");
  expect(badge()?.className).toContain("bg-red-100");
  expect(swatch()).toBeNull();
  expect(wrapper()).toBeNull();
});

test("label のみ: ラッパ内に truncate label のみで swatch なし", () => {
  render({ value: "None", label: "None" });
  expect(wrapper()).toBeTruthy();
  expect(label()?.textContent).toBe("None");
  expect(swatch()).toBeNull();
});

test("未選択（undefined）: 何も描画されない", () => {
  render(undefined);
  expect(container?.querySelector("span")).toBeNull();
  expect(container?.textContent).toBe("");
});

test("swatch + badge 同時: badge 優先で swatch を出さない", () => {
  render({
    value: "High",
    label: "High",
    swatchColor: "#222222",
    badgeClassName: "bg-red-100",
  });
  expect(badge()?.textContent).toBe("High");
  expect(swatch()).toBeNull();
});
