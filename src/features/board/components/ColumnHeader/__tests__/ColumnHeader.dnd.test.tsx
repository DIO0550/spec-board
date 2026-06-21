import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { COLUMN_DRAG_MIME_TYPE } from "../../Board/mime";
import { ColumnHeader } from "..";

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

const render = (
  props: Omit<Parameters<typeof ColumnHeader>[0], "order"> & {
    order?: number;
  },
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ColumnHeader, { order: 0, ...props }));
  });
};

const queryHeader = (): HTMLElement => {
  const el = container?.querySelector<HTMLElement>(
    "[data-testid='column-header']",
  );
  expect(el).not.toBeNull();
  return el as HTMLElement;
};

const dispatchDragStartFromTarget = (target: HTMLElement) => {
  const event = createDragEvent("dragstart");
  Object.defineProperty(event, "target", { value: target, configurable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

test("draggable=true の最外殻 dragstart で setData(COLUMN_DRAG_MIME_TYPE, name) + onColumnDragStart(name)", () => {
  const onColumnDragStart = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    draggable: true,
    onColumnDragStart,
  });
  const header = queryHeader();
  const event = createDragEvent("dragstart");
  act(() => {
    header.dispatchEvent(event);
  });
  expect(event.dataTransfer.getData(COLUMN_DRAG_MIME_TYPE)).toBe("A");
  expect(event.dataTransfer.effectAllowed).toBe("move");
  expect(onColumnDragStart).toHaveBeenCalledWith("A");
});

test("dragend で onColumnDragEnd が呼ばれる", () => {
  const onColumnDragEnd = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    draggable: true,
    onColumnDragEnd,
  });
  const header = queryHeader();
  act(() => {
    header.dispatchEvent(createDragEvent("dragend"));
  });
  expect(onColumnDragEnd).toHaveBeenCalledTimes(1);
});

test("rename ボタン発火の dragstart は preventDefault され setData / onColumnDragStart が呼ばれない", () => {
  const onColumnDragStart = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename: vi.fn(),
    draggable: true,
    onColumnDragStart,
  });
  const renameBtn = container?.querySelector<HTMLElement>(
    "[data-testid='column-name-button']",
  );
  expect(renameBtn).not.toBeNull();
  const event = dispatchDragStartFromTarget(renameBtn as HTMLElement);
  expect(event.defaultPrevented).toBe(true);
  expect(event.dataTransfer.getData(COLUMN_DRAG_MIME_TYPE)).toBe("");
  expect(onColumnDragStart).not.toHaveBeenCalled();
});

test("メニューボタン発火の dragstart も preventDefault される", () => {
  const onColumnDragStart = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    onContextMenu: vi.fn(),
    draggable: true,
    onColumnDragStart,
  });
  const menuBtn = container?.querySelector<HTMLElement>(
    "[data-testid='column-menu-button']",
  );
  expect(menuBtn).not.toBeNull();
  const event = dispatchDragStartFromTarget(menuBtn as HTMLElement);
  expect(event.defaultPrevented).toBe(true);
  expect(onColumnDragStart).not.toHaveBeenCalled();
});

test("+ 追加 ボタン発火の dragstart も preventDefault される", () => {
  const onColumnDragStart = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    draggable: true,
    onColumnDragStart,
  });
  const addBtn = container?.querySelector<HTMLElement>(
    `button[aria-label="Aに追加"]`,
  );
  expect(addBtn).not.toBeNull();
  const event = dispatchDragStartFromTarget(addBtn as HTMLElement);
  expect(event.defaultPrevented).toBe(true);
  expect(onColumnDragStart).not.toHaveBeenCalled();
});

test("子 rename ボタン click は startEditing を発火させる", () => {
  const onRename = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename,
    draggable: true,
  });
  const renameBtn = container?.querySelector<HTMLButtonElement>(
    "[data-testid='column-name-button']",
  );
  act(() => {
    renameBtn?.click();
  });
  expect(
    container?.querySelector("[data-testid='column-rename-input']"),
  ).not.toBeNull();
});

test("draggable=false (未指定) では setData / onColumnDragStart が呼ばれない", () => {
  const onColumnDragStart = vi.fn();
  render({
    name: "A",
    taskCount: 0,
    onAddClick: vi.fn(),
    onColumnDragStart,
  });
  const header = queryHeader();
  const event = createDragEvent("dragstart");
  act(() => {
    header.dispatchEvent(event);
  });
  expect(event.dataTransfer.getData(COLUMN_DRAG_MIME_TYPE)).toBe("");
  expect(onColumnDragStart).not.toHaveBeenCalled();
});
