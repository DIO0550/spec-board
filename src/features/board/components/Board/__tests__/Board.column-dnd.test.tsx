import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import type { Column as ColumnType } from "@/types/column";
import { Board } from "..";
import { COLUMN_DRAG_MIME_TYPE } from "../mime";

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

const render = (props: Parameters<typeof Board>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Board, props));
  });
};

const columns3: ColumnType[] = [
  { name: "A", order: 0 },
  { name: "B", order: 1 },
  { name: "C", order: 2 },
];

const columnSections = (): HTMLElement[] =>
  Array.from(
    container?.querySelectorAll<HTMLElement>(
      "section[data-testid^='column-']",
    ) ?? [],
  );

const headers = (): HTMLElement[] =>
  Array.from(
    container?.querySelectorAll<HTMLElement>("[data-testid='column-header']") ??
      [],
  );

test("columns が逆順でも表示順 (order 昇順) で render される", () => {
  const reversed: ColumnType[] = [
    { name: "C", order: 2 },
    { name: "B", order: 1 },
    { name: "A", order: 0 },
  ];
  render({ columns: reversed, tasks: [], onAddTask: vi.fn() });
  expect(columnSections().map((s) => s.getAttribute("aria-label"))).toEqual([
    "A",
    "B",
    "C",
  ]);
});

test("カラムが 2 件以上のとき、ColumnHeader は draggable=true で render される", () => {
  render({ columns: columns3, tasks: [], onAddTask: vi.fn() });
  for (const header of headers()) {
    expect(header.getAttribute("draggable")).toBe("true");
  }
});

test("カラムが 1 件のとき、ColumnHeader は draggable=false で render される", () => {
  render({
    columns: [{ name: "Only", order: 0 }],
    tasks: [],
    onAddTask: vi.fn(),
  });
  const header = headers()[0];
  expect(header?.getAttribute("draggable")).toBe("false");
});

test("カラムヘッダーで dragstart → 別カラムで drop すると onColumnReorder({fromColumnName, toColumnName})", () => {
  const onColumnReorder = vi.fn();
  render({
    columns: columns3,
    tasks: [],
    onAddTask: vi.fn(),
    onColumnReorder,
  });
  const [headerA, , headerC] = headers();
  const startEvent = createDragEvent("dragstart");
  act(() => {
    headerA.dispatchEvent(startEvent);
  });
  // dragstart should have populated dataTransfer with column MIME
  expect(startEvent.dataTransfer.getData(COLUMN_DRAG_MIME_TYPE)).toBe("A");

  const sections = columnSections();
  const sectionC = sections[2];
  const dropEvent = createDragEvent("drop", {
    dataTransfer: startEvent.dataTransfer,
  });
  act(() => {
    sectionC.dispatchEvent(dropEvent);
  });
  expect(headerC).toBeDefined();
  expect(onColumnReorder).toHaveBeenCalledWith({
    fromColumnName: "A",
    toColumnName: "C",
  });
});
