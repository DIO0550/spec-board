import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ParseErrorIcon } from "@/components/ParseErrorIcon";

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
 * ParseErrorIcon をレンダリングするヘルパー。
 * @param props - ParseErrorIcon に渡す props
 */
const render = (props: Parameters<typeof ParseErrorIcon>[0] = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ParseErrorIcon, props));
  });
};

const queryIcon = (): SVGElement | null =>
  document.querySelector('[data-testid="parse-error-icon"]');

test("デフォルト: role=img / aria-label=パースエラーあり / title が描画される", () => {
  render();
  const icon = queryIcon();
  expect(icon).not.toBeNull();
  expect(icon?.getAttribute("role")).toBe("img");
  expect(icon?.getAttribute("aria-label")).toBe("パースエラーあり");
  expect(icon?.querySelector("title")?.textContent).toBe("パースエラーあり");
});

test("className 未指定時はデフォルト text-red-500", () => {
  render();
  const icon = queryIcon();
  expect(icon?.getAttribute("class")).toBe("text-red-500");
});

test("size 未指定時はデフォルト 16", () => {
  render();
  const icon = queryIcon();
  expect(icon?.getAttribute("width")).toBe("16");
  expect(icon?.getAttribute("height")).toBe("16");
});

test("label prop で aria-label と title を上書きできる", () => {
  render({ label: "不正な値" });
  const icon = queryIcon();
  expect(icon?.getAttribute("aria-label")).toBe("不正な値");
  expect(icon?.querySelector("title")?.textContent).toBe("不正な値");
});

test("size prop で width / height が変わる", () => {
  render({ size: 24 });
  const icon = queryIcon();
  expect(icon?.getAttribute("width")).toBe("24");
  expect(icon?.getAttribute("height")).toBe("24");
});

test("className prop でクラスが適用される", () => {
  render({ className: "text-red-700" });
  const icon = queryIcon();
  expect(icon?.getAttribute("class")).toBe("text-red-700");
});
