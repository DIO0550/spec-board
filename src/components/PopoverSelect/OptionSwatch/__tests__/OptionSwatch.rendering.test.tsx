import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { OptionSwatch } from "..";

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

const render = (color: string) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(OptionSwatch, { color }));
  });
};

const swatch = (): HTMLElement =>
  container?.querySelector("span") as HTMLElement;

test("指定した color が inline style の backgroundColor に反映される", () => {
  render("#ff0000");
  expect(swatch().getAttribute("style")).toContain("#ff0000");
});

test("swatch の静的クラスが付与される", () => {
  render("#123456");
  expect(swatch().className).toContain("size-2.5");
  expect(swatch().className).toContain("shrink-0");
  expect(swatch().className).toContain("rounded-full");
});

test.each([
  "#ffffff",
  "rgb(0, 0, 0)",
  "#abcdef",
])("color=%s が backgroundColor に反映される", (color) => {
  render(color);
  expect(swatch().getAttribute("style")).toContain(color);
});
