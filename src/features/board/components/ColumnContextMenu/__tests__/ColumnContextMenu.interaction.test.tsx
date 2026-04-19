import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ColumnContextMenu } from "..";

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

function render(props: Parameters<typeof ColumnContextMenu>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ColumnContextMenu, props));
  });
}

test("削除項目クリックで onDelete と onClose が呼ばれる", () => {
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render({ x: 0, y: 0, canDelete: true, onDelete, onClose });
  const item = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement;
  act(() => {
    item.click();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("canDelete=false の場合、クリックしても onDelete は呼ばれない", () => {
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render({ x: 0, y: 0, canDelete: false, onDelete, onClose });
  const item = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement;
  act(() => {
    item.click();
  });
  expect(onDelete).not.toHaveBeenCalled();
});

test("オーバーレイクリックで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({
    x: 0,
    y: 0,
    canDelete: true,
    onDelete: vi.fn(),
    onClose,
  });
  const overlay = document.querySelector(
    '[data-testid="column-context-menu-overlay"]',
  ) as HTMLElement;
  act(() => {
    overlay.click();
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Esc キーで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({
    x: 0,
    y: 0,
    canDelete: true,
    onDelete: vi.fn(),
    onClose,
  });
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(onClose).toHaveBeenCalled();
});
