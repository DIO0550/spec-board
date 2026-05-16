import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import type { Column as ColumnType } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { Board } from "..";
import { DRAG_MIME_TYPE } from "../dragState";

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

const columns: ColumnType[] = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

const render = (props: Parameters<typeof Board>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Board, props));
  });
};

const queryCard = (filePath: string): HTMLElement => {
  const cards = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-testid='task-card']") ?? [],
  );
  const matched = cards.find((c) => {
    const drag = createDragEvent("dragstart");
    c.dispatchEvent(drag);
    return drag.dataTransfer.getData(DRAG_MIME_TYPE) === filePath;
  });
  expect(matched).toBeDefined();
  return matched as HTMLElement;
};

const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
const taskB = makeTask({ id: "b", filePath: "tasks/b.md", status: "Done" });

test("dragstart 後、対象カードに data-dragging='true' が付く", () => {
  render({ columns, tasks: [taskA, taskB], onAddTask: vi.fn() });
  const cards =
    container?.querySelectorAll<HTMLElement>("[data-testid='task-card']") ?? [];
  const cardA = cards[0];
  expect(cardA).toBeDefined();
  act(() => {
    cardA?.dispatchEvent(createDragEvent("dragstart"));
  });
  const refreshed = container?.querySelector<HTMLElement>(
    "[data-dragging='true']",
  );
  expect(refreshed).not.toBeNull();
});

test("drop で onTaskDrop prop が期待引数で呼ばれる", async () => {
  const onTaskDrop = vi.fn().mockResolvedValue(undefined);
  render({
    columns,
    tasks: [taskA, taskB],
    onAddTask: vi.fn(),
    onTaskDrop,
  });
  const cardA = queryCard("tasks/a.md");
  act(() => {
    cardA.dispatchEvent(createDragEvent("dragstart"));
  });
  const doneSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Done']",
  );
  expect(doneSection).not.toBeNull();
  // hover first
  const hover = createDragEvent("dragover", { clientY: 0 });
  hover.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    doneSection?.dispatchEvent(hover);
  });
  // then drop
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    doneSection?.dispatchEvent(drop);
  });
  await vi.waitFor(() => {
    expect(onTaskDrop).toHaveBeenCalledWith({
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: expect.any(Number),
    });
  });
});

test("drop 完了後に dragState がリセットされる（プレースホルダ消失）", async () => {
  const onTaskDrop = vi.fn().mockResolvedValue(undefined);
  render({
    columns,
    tasks: [taskA, taskB],
    onAddTask: vi.fn(),
    onTaskDrop,
  });
  const cardA = queryCard("tasks/a.md");
  act(() => {
    cardA.dispatchEvent(createDragEvent("dragstart"));
  });
  const doneSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Done']",
  );
  const hover = createDragEvent("dragover", { clientY: 0 });
  hover.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    doneSection?.dispatchEvent(hover);
  });
  expect(
    container?.querySelector("[data-testid='drop-placeholder']"),
  ).not.toBeNull();
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    doneSection?.dispatchEvent(drop);
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='drop-placeholder']"),
    ).toBeNull();
  });
});

test("onTaskDrop が reject しても finally で dragState が null になる", async () => {
  const onTaskDrop = vi.fn().mockRejectedValue(new Error("boom"));
  render({
    columns,
    tasks: [taskA, taskB],
    onAddTask: vi.fn(),
    onTaskDrop,
  });
  const cardA = queryCard("tasks/a.md");
  act(() => {
    cardA.dispatchEvent(createDragEvent("dragstart"));
  });
  const doneSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Done']",
  );
  const hover = createDragEvent("dragover", { clientY: 0 });
  hover.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    doneSection?.dispatchEvent(hover);
  });
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    doneSection?.dispatchEvent(drop);
  });
  await vi.waitFor(() => {
    expect(container?.querySelector("[data-dragging='true']")).toBeNull();
  });
});

test("dragend 単独（drop なし）で dragState が null になる", () => {
  render({ columns, tasks: [taskA, taskB], onAddTask: vi.fn() });
  const cardA = queryCard("tasks/a.md");
  act(() => {
    cardA.dispatchEvent(createDragEvent("dragstart"));
  });
  expect(container?.querySelector("[data-dragging='true']")).not.toBeNull();
  act(() => {
    cardA.dispatchEvent(createDragEvent("dragend"));
  });
  expect(container?.querySelector("[data-dragging='true']")).toBeNull();
});
