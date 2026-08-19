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

test("メニュー本体が表示される", () => {
  render({
    x: 10,
    y: 20,
    canDelete: true,
    onDelete: vi.fn(),
    onClose: vi.fn(),
  });
  const menu = document.querySelector('[data-testid="column-context-menu"]');
  expect(menu).toBeTruthy();
});

test("「削除」メニュー項目が表示される", () => {
  render({
    x: 0,
    y: 0,
    canDelete: true,
    onDelete: vi.fn(),
    onClose: vi.fn(),
  });
  const item = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  );
  expect(item?.textContent).toContain("削除");
});

test("canDelete=false の場合、削除項目は disabled になる", () => {
  render({
    x: 0,
    y: 0,
    canDelete: false,
    onDelete: vi.fn(),
    onClose: vi.fn(),
  });
  const item = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement | null;
  expect(item?.disabled).toBe(true);
});

test("指定座標にメニューが配置される", () => {
  render({
    x: 100,
    y: 200,
    canDelete: true,
    onDelete: vi.fn(),
    onClose: vi.fn(),
  });
  const menu = document.querySelector(
    '[data-testid="column-context-menu"]',
  ) as HTMLElement | null;
  expect(menu?.style.left).toBe("100px");
  expect(menu?.style.top).toBe("200px");
});

test("onArchiveTasks 指定時は「タスクをまとめてアーカイブ」項目を表示する", async () => {
  render({
    x: 0,
    y: 0,
    canDelete: true,
    onDelete: vi.fn(),
    onArchiveTasks: vi.fn(),
    onClose: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='column-context-menu-archive']"),
    ).not.toBeNull();
  });
});

test("onArchiveTasks 未指定ではアーカイブ項目を表示しない", async () => {
  render({ x: 0, y: 0, canDelete: true, onDelete: vi.fn(), onClose: vi.fn() });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='column-context-menu']"),
    ).not.toBeNull();
  });
  expect(
    container?.querySelector("[data-testid='column-context-menu-archive']"),
  ).toBeNull();
});

test("アーカイブ項目クリックで onArchiveTasks と onClose が呼ばれる", async () => {
  const onArchiveTasks = vi.fn();
  const onClose = vi.fn();
  render({
    x: 0,
    y: 0,
    canDelete: true,
    onDelete: vi.fn(),
    onArchiveTasks,
    onClose,
  });
  let item: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    item = container?.querySelector<HTMLButtonElement>(
      "[data-testid='column-context-menu-archive']",
    ) as HTMLButtonElement | null;
    expect(item).not.toBeNull();
  });
  act(() => {
    (item as HTMLButtonElement | null)?.click();
  });
  expect(onArchiveTasks).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
