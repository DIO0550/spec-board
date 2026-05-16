import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { Task, type TaskPayload } from "@/types/task";
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

test("dragover で onDragHover(name, index) が呼ばれる", () => {
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
  expect(onDragHover).toHaveBeenCalledWith("Todo", 0);
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
