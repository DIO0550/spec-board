import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { OptionBadge } from "..";

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

const render = (props: Parameters<typeof OptionBadge>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(OptionBadge, props));
  });
};

const badge = (): HTMLElement =>
  container?.querySelector("span") as HTMLElement;

test("label が表示される", () => {
  render({ label: "High", badgeClassName: "bg-red-100 text-red-800" });
  expect(badge().textContent).toBe("High");
});

test("ベースの静的クラスと動的 badgeClassName の両方が連結される", () => {
  render({ label: "High", badgeClassName: "bg-red-100 text-red-800" });
  const className = badge().className;
  expect(className).toContain("inline-flex");
  expect(className).toContain("rounded-full");
  expect(className).toContain("text-xs");
  expect(className).toContain("font-semibold");
  expect(className).toContain("bg-red-100");
  expect(className).toContain("text-red-800");
});

test.each([
  ["High", "bg-red-100 text-red-800"],
  ["Low", "bg-blue-100 text-blue-800"],
])("label=%s / badgeClassName=%s が反映される", (label, badgeClassName) => {
  render({ label, badgeClassName });
  expect(badge().textContent).toBe(label);
  expect(badge().className).toContain(badgeClassName);
});
