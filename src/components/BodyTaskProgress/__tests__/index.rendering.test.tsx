import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { BodyTaskProgress } from "..";

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
 * @param props - done / total
 */
function render(props: { done: number; total: number }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(BodyTaskProgress, props));
  });
}

test("done=1 total=2 で aria-valuenow=50 とテキスト 1/2 を描画する", () => {
  render({ done: 1, total: 2 });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("50");
  expect(container?.textContent).toContain("1/2");
});

test("done=3 total=3 で aria-valuenow=100 を描画する", () => {
  render({ done: 3, total: 3 });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("100");
});

test("total=0 のとき何も描画しない", () => {
  render({ done: 0, total: 0 });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar).toBeNull();
  expect(container?.textContent).toBe("");
});

test("done=1 total=3 は四捨五入して aria-valuenow=33 を描画する", () => {
  render({ done: 1, total: 3 });
  const bar = document.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("33");
});
