import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { WarningIcon } from "@/components/WarningIcon";

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

/**
 * WarningIcon をレンダリングするヘルパー。
 * @param props - WarningIcon に渡す props
 */
const render = (props: Parameters<typeof WarningIcon>[0] = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(WarningIcon, props));
  });
};

const queryIcon = (): SVGElement | null =>
  document.querySelector('[data-testid="warning-icon"]');

test("デフォルト: role=img / aria-label=リンク切れあり / title が描画される", () => {
  render();
  const icon = queryIcon();
  expect(icon).not.toBeNull();
  expect(icon?.getAttribute("role")).toBe("img");
  expect(icon?.getAttribute("aria-label")).toBe("リンク切れあり");
  expect(icon?.querySelector("title")?.textContent).toBe("リンク切れあり");
});

test("label prop で aria-label と title を上書きできる", () => {
  render({ label: "壊れたリンク" });
  const icon = queryIcon();
  expect(icon?.getAttribute("aria-label")).toBe("壊れたリンク");
  expect(icon?.querySelector("title")?.textContent).toBe("壊れたリンク");
});

test("size prop で width / height が変わる", () => {
  render({ size: 24 });
  const icon = queryIcon();
  expect(icon?.getAttribute("width")).toBe("24");
  expect(icon?.getAttribute("height")).toBe("24");
});

test("className prop でクラスが適用される", () => {
  render({ className: "text-red-500" });
  const icon = queryIcon();
  expect(icon?.getAttribute("class")).toBe("text-red-500");
});

test("size 未指定時はデフォルト 16", () => {
  render();
  const icon = queryIcon();
  expect(icon?.getAttribute("width")).toBe("16");
  expect(icon?.getAttribute("height")).toBe("16");
});

test("className 未指定時はデフォルト text-yellow-500", () => {
  render();
  const icon = queryIcon();
  expect(icon?.getAttribute("class")).toBe("text-yellow-500");
});
