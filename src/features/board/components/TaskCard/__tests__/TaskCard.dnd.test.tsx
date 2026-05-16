import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { Task, type TaskPayload } from "@/types/task";
import { DRAG_MIME_TYPE } from "../../Board/dragState";
import { TaskCard } from "..";

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
    id: "task-1",
    title: "テスト",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

const render = (props: Parameters<typeof TaskCard>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskCard, props));
  });
};

const queryCard = (): HTMLElement => {
  const el = container?.querySelector<HTMLElement>("[data-testid='task-card']");
  expect(el).not.toBeNull();
  return el as HTMLElement;
};

test.each([
  { name: "onClick あり", onClick: vi.fn() },
  { name: "onClick なし", onClick: undefined },
])("$name でも draggable=true 属性が出力される", ({ onClick }) => {
  render({ task: makeTask(), fromColumn: "Todo", onClick });
  const card = queryCard();
  expect(card.getAttribute("draggable")).toBe("true");
});

test("dragstart で dataTransfer.setData(DRAG_MIME_TYPE, filePath) が呼ばれる", () => {
  render({
    task: makeTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
    onClick: vi.fn(),
  });
  const card = queryCard();
  const event = createDragEvent("dragstart");
  act(() => {
    card.dispatchEvent(event);
  });
  expect(event.dataTransfer.getData(DRAG_MIME_TYPE)).toBe("tasks/a.md");
});

test("dragstart で onDragStart(filePath, fromColumn) が呼ばれる", () => {
  const onDragStart = vi.fn();
  render({
    task: makeTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
    onDragStart,
    onClick: vi.fn(),
  });
  const card = queryCard();
  act(() => {
    card.dispatchEvent(createDragEvent("dragstart"));
  });
  expect(onDragStart).toHaveBeenCalledWith("tasks/a.md", "Todo");
});

test("dragend で onDragEnd が呼ばれる", () => {
  const onDragEnd = vi.fn();
  render({
    task: makeTask(),
    fromColumn: "Todo",
    onDragEnd,
    onClick: vi.fn(),
  });
  const card = queryCard();
  act(() => {
    card.dispatchEvent(createDragEvent("dragend"));
  });
  expect(onDragEnd).toHaveBeenCalled();
});

test("isDragging=true で data-dragging='true' + opacity-40 class が付く", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    isDragging: true,
    onClick: vi.fn(),
  });
  const card = queryCard();
  expect(card.getAttribute("data-dragging")).toBe("true");
  expect(card.className).toContain("opacity-40");
});

test("isDragging=false で data-dragging 属性が存在しない", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    isDragging: false,
    onClick: vi.fn(),
  });
  const card = queryCard();
  expect(card.hasAttribute("data-dragging")).toBe(false);
});

test("dragstart → dragend → click（synthetic, macrotask 前）の順では onClick が呼ばれない", () => {
  vi.useFakeTimers();
  try {
    const onClick = vi.fn();
    render({ task: makeTask(), fromColumn: "Todo", onClick });
    const card = queryCard();
    act(() => {
      card.dispatchEvent(createDragEvent("dragstart"));
    });
    act(() => {
      card.dispatchEvent(createDragEvent("dragend"));
    });
    // dragend 内の setTimeout(0) はまだ走っていない。この間に発火する
    // synthetic click は dragGuardRef により抑止される。
    act(() => {
      card.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("dragstart → dragend → macrotask 経過後の click は onClick が呼ばれる", () => {
  vi.useFakeTimers();
  try {
    const onClick = vi.fn();
    render({ task: makeTask({ id: "x" }), fromColumn: "Todo", onClick });
    const card = queryCard();
    act(() => {
      card.dispatchEvent(createDragEvent("dragstart"));
    });
    act(() => {
      card.dispatchEvent(createDragEvent("dragend"));
    });
    // dragend の setTimeout(0) を消化して guard を解除する
    act(() => {
      vi.advanceTimersByTime(1);
    });
    act(() => {
      card.click();
    });
    expect(onClick).toHaveBeenCalledWith("x");
  } finally {
    vi.useRealTimers();
  }
});

test("通常 click（drag を介さない）は onClick が呼ばれる", () => {
  const onClick = vi.fn();
  render({ task: makeTask({ id: "x" }), fromColumn: "Todo", onClick });
  const card = queryCard();
  act(() => {
    card.click();
  });
  expect(onClick).toHaveBeenCalledWith("x");
});
