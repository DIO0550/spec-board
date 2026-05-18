import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { Task, type TaskPayload } from "@/types/task";
import { COLUMN_DRAG_MIME_TYPE } from "../../Board/columnDragState";
import { DRAG_MIME_TYPE, type DragState } from "../../Board/dragState";
import { Column } from "..";

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

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "id",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

const render = (props: Parameters<typeof Column>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Column, props));
  });
};

const querySection = (): HTMLElement => {
  const el = container?.querySelector<HTMLElement>("section");
  expect(el).not.toBeNull();
  return el as HTMLElement;
};

const draggingState = (filePath: string, fromColumn: string): DragState => ({
  draggingTaskFilePath: filePath,
  draggingFromColumn: fromColumn,
  hoverColumn: null,
  hoverIndex: null,
});

test("独自 MIME を持つ dragover で preventDefault される", () => {
  render({ name: "Todo", tasks: [], onAddClick: vi.fn() });
  const section = querySection();
  const event = createDragEvent("dragover");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
});

test("他 MIME (text/plain) の dragover では preventDefault されない", () => {
  render({ name: "Todo", tasks: [], onAddClick: vi.fn() });
  const section = querySection();
  const event = createDragEvent("dragover");
  event.dataTransfer.setData("text/plain", "x");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(false);
});

test("dragover で onDragHover(name, index) が呼ばれる", async () => {
  const onDragHover = vi.fn();
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDragHover,
    dragState: draggingState("tasks/a.md", "Done"),
  });
  const section = querySection();
  const event = createDragEvent("dragover", { clientY: 0 });
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  await vi.waitFor(() => {
    expect(onDragHover).toHaveBeenCalledWith("Todo", 0);
  });
});

test("currentTarget 外への dragleave で onDragHover(null, null) が呼ばれる", () => {
  const onDragHover = vi.fn();
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDragHover,
    dragState: draggingState("tasks/a.md", "Done"),
  });
  const section = querySection();
  const event = createDragEvent("dragleave");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onDragHover).toHaveBeenCalledWith(null, null);
});

test("drop で onTaskDrop が期待引数で呼ばれる", () => {
  const onTaskDrop = vi.fn();
  render({
    name: "Done",
    tasks: [],
    onAddClick: vi.fn(),
    onTaskDrop,
    dragState: {
      draggingTaskFilePath: "tasks/a.md",
      draggingFromColumn: "Todo",
      hoverColumn: "Done",
      hoverIndex: 0,
    },
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).toHaveBeenCalledWith({
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });
});

test("dataTransfer 空の drop（外部 D&D）では onTaskDrop が呼ばれない", () => {
  const onTaskDrop = vi.fn();
  render({
    name: "Done",
    tasks: [],
    onAddClick: vi.fn(),
    onTaskDrop,
    dragState: draggingState("tasks/a.md", "Todo"),
  });
  const section = querySection();
  const event = createDragEvent("drop");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).not.toHaveBeenCalled();
});

test("dataTransfer の filePath が dragState と不一致なら onTaskDrop が呼ばれない", () => {
  const onTaskDrop = vi.fn();
  render({
    name: "Done",
    tasks: [],
    onAddClick: vi.fn(),
    onTaskDrop,
    dragState: draggingState("tasks/a.md", "Todo"),
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/wrong.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).not.toHaveBeenCalled();
});

test("空カラムでの drop は toIndex=0 で呼ばれる", () => {
  const onTaskDrop = vi.fn();
  render({
    name: "Done",
    tasks: [],
    onAddClick: vi.fn(),
    onTaskDrop,
    dragState: draggingState("tasks/a.md", "Todo"),
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).toHaveBeenCalledWith({
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 0,
  });
});

test("非空カラムでの drop は dragState.hoverIndex ではなく drop event の clientY から toIndex を同期計算する", () => {
  const tasks = [
    makeTask({ id: "1", filePath: "tasks/1.md", status: "Done" }),
    makeTask({ id: "2", filePath: "tasks/2.md", status: "Done" }),
    makeTask({ id: "3", filePath: "tasks/3.md", status: "Done" }),
  ];
  const onTaskDrop = vi.fn();
  render({
    name: "Done",
    tasks,
    onAddClick: vi.fn(),
    onTaskDrop,
    // dragState.hoverIndex は故意に 0（古い stale 値）に設定
    dragState: {
      draggingTaskFilePath: "tasks/a.md",
      draggingFromColumn: "Todo",
      hoverColumn: "Done",
      hoverIndex: 0,
    },
  });
  const liElements =
    container?.querySelectorAll<HTMLLIElement>("li[data-task-card]") ?? [];
  expect(liElements.length).toBe(3);
  // 各カードに 40px 刻みの bounding rect を割り当てる
  const rects = [
    { top: 0, bottom: 40 },
    { top: 40, bottom: 80 },
    { top: 80, bottom: 120 },
  ];
  liElements.forEach((el, i) => {
    const r = rects[i] as { top: number; bottom: number };
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top: r.top,
      bottom: r.bottom,
      left: 0,
      right: 100,
      width: 100,
      height: r.bottom - r.top,
      x: 0,
      y: r.top,
      toJSON: () => ({}),
    } as DOMRect);
  });
  // clientY = 70（2 枚目の下半分 = 2 枚目と 3 枚目の間 → index 2）
  const section = querySection();
  const event = createDragEvent("drop", { clientY: 70 });
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).toHaveBeenCalledWith({
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
    toColumn: "Done",
    toIndex: 2,
  });
  // dragState.hoverIndex=0 ではなく 2 が使われていることが本テストの核心
});

test("dragState.hoverColumn === name の時のみ drop-placeholder が出る", () => {
  const tasks = [makeTask({ id: "1", filePath: "tasks/1.md" })];
  render({
    name: "Todo",
    tasks,
    onAddClick: vi.fn(),
    dragState: {
      draggingTaskFilePath: "tasks/x.md",
      draggingFromColumn: "Todo",
      hoverColumn: "Todo",
      hoverIndex: 0,
    },
  });
  expect(
    container?.querySelector("[data-testid='drop-placeholder']"),
  ).not.toBeNull();
});

test("dragState.hoverColumn が他カラムの時は placeholder が出ない", () => {
  const tasks = [makeTask({ id: "1", filePath: "tasks/1.md" })];
  render({
    name: "Todo",
    tasks,
    onAddClick: vi.fn(),
    dragState: {
      draggingTaskFilePath: "tasks/x.md",
      draggingFromColumn: "Done",
      hoverColumn: "Done",
      hoverIndex: 0,
    },
  });
  expect(
    container?.querySelector("[data-testid='drop-placeholder']"),
  ).toBeNull();
});

test("column MIME の dragover で preventDefault + onColumnHover(name)", () => {
  const onColumnHover = vi.fn();
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onColumnHover,
  });
  const section = querySection();
  const event = createDragEvent("dragover");
  event.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, "Done");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  expect(onColumnHover).toHaveBeenCalledWith("Todo");
});

test("column MIME の drop で onColumnDrop({fromColumnName, toColumnName})", () => {
  const onColumnDrop = vi.fn();
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onColumnDrop,
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, "Done");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  expect(onColumnDrop).toHaveBeenCalledWith({
    fromColumnName: "Done",
    toColumnName: "Todo",
  });
});

test("column MIME の drop で fromColumnName が空文字列なら onColumnDrop は呼ばれない", () => {
  const onColumnDrop = vi.fn();
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onColumnDrop,
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, "");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onColumnDrop).not.toHaveBeenCalled();
});

test("columnDraggable=true を渡すと内部 ColumnHeader に draggable=true が配線される", () => {
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    columnDraggable: true,
  });
  const header = container?.querySelector<HTMLElement>(
    "[data-testid='column-header']",
  );
  expect(header?.getAttribute("draggable")).toBe("true");
});

test("columnDraggable=false / 未指定なら ColumnHeader の draggable は false", () => {
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
  });
  const header = container?.querySelector<HTMLElement>(
    "[data-testid='column-header']",
  );
  expect(header?.getAttribute("draggable")).toBe("false");
});
