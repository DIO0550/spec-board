import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { computePreviewWidth } from "@/features/task-form/lib/computePreviewWidth";
import { PreviewResizer } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let originalInnerWidth: number;

const VIEWPORT_WIDTH = 1200;

beforeEach(() => {
  originalInnerWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: VIEWPORT_WIDTH,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.classList.remove("resizing-x");
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
});

const render = (onWidthChange: (w: number) => void) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PreviewResizer, { onWidthChange }));
  });
};

const handle = (): HTMLElement =>
  document.querySelector('[data-testid="preview-resizer"]') as HTMLElement;

const dispatchPointer = (el: Element, type: string, clientX: number) => {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX }));
  });
};

test("リサイズハンドルが描画される", () => {
  render(vi.fn());
  expect(handle()).toBeTruthy();
  expect(handle().getAttribute("aria-label")).toBe("プレビュー幅を変更");
});

test("pointerdown→pointermove で clientX から算出した幅が onWidthChange に渡る", () => {
  const onWidthChange = vi.fn();
  render(onWidthChange);
  dispatchPointer(handle(), "pointerdown", 600);
  dispatchPointer(handle(), "pointermove", 700);
  expect(onWidthChange).toHaveBeenCalledWith(
    computePreviewWidth({ clientX: 700, viewportWidth: VIEWPORT_WIDTH }),
  );
});

test("pointerup 後の pointermove では onWidthChange が呼ばれない", () => {
  const onWidthChange = vi.fn();
  render(onWidthChange);
  dispatchPointer(handle(), "pointerdown", 600);
  dispatchPointer(handle(), "pointermove", 700);
  const callsAfterDrag = onWidthChange.mock.calls.length;
  dispatchPointer(handle(), "pointerup", 700);
  dispatchPointer(handle(), "pointermove", 500);
  expect(onWidthChange.mock.calls.length).toBe(callsAfterDrag);
});

test("drag 開始で body に resizing-x が付き、終了で除去される", () => {
  render(vi.fn());
  dispatchPointer(handle(), "pointerdown", 600);
  expect(document.body.classList.contains("resizing-x")).toBe(true);
  dispatchPointer(handle(), "pointerup", 600);
  expect(document.body.classList.contains("resizing-x")).toBe(false);
});

test("drag していない状態の pointermove では onWidthChange が呼ばれない", () => {
  const onWidthChange = vi.fn();
  render(onWidthChange);
  dispatchPointer(handle(), "pointermove", 700);
  expect(onWidthChange).not.toHaveBeenCalled();
});
