import { act, createElement, type ReactNode, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { Task, type TaskPayload } from "@/types/task";
import { DRAG_MIME_TYPE } from "../../../Board/dragState";
import {
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardRoot, type TaskCardRootProps } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
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

const renderRoot = (
  props: Partial<TaskCardRootProps> = {},
  children: ReactNode = null,
) => {
  const merged: TaskCardRootProps = {
    task: createTask(),
    fromColumn: "Todo",
    ...props,
    children,
  };
  act(() => {
    root?.render(createElement(TaskCardRoot, merged));
  });
};

const queryCard = (): HTMLElement => {
  const el = container?.querySelector<HTMLElement>("[data-testid='task-card']");
  expect(el).not.toBeNull();
  return el as HTMLElement;
};

test("Context Value は依存不変なら同一参照（useMemo）", () => {
  const refs: (TaskCardContextValue | null)[] = [];
  const Probe = () => {
    const ctx = useContext(TaskCardContext);
    refs.push(ctx);
    return null;
  };
  const task = createTask();
  const childTasks: readonly Task[] = [];
  renderRoot({ task, childTasks }, createElement(Probe));
  // 同一 props で再 render（同一 root に再 render するため renderRoot 内の act が走る）
  renderRoot({ task, childTasks }, createElement(Probe));
  expect(refs.length).toBeGreaterThanOrEqual(2);
  expect(refs[0]).not.toBeNull();
  expect(refs[0]).toBe(refs[1]);
});

test("childTasks 未指定でも 2 回連続レンダーで Context Value 参照が安定する", () => {
  // childTasks ?? [] のリテラル再生成で memo が壊れないか（実呼び出し元 Column が
  // 必ず childTasks を渡すケースとは別に、Compound 直接利用での識別性を担保する）
  const refs: (TaskCardContextValue | null)[] = [];
  const Probe = () => {
    const ctx = useContext(TaskCardContext);
    refs.push(ctx);
    return null;
  };
  const task = createTask();
  renderRoot({ task }, createElement(Probe));
  renderRoot({ task }, createElement(Probe));
  expect(refs.length).toBeGreaterThanOrEqual(2);
  expect(refs[0]).not.toBeNull();
  expect(refs[0]).toBe(refs[1]);
});

test("childTasks に都度新規の空配列を渡しても Context Value 参照が安定する", () => {
  // Column 側が `descendantsByFilePath.get(...) ?? []` のように渡す現実ケース。
  // length === 0 の正規化が無いと、毎レンダー新しい [] で useMemo が miss する。
  const refs: (TaskCardContextValue | null)[] = [];
  const Probe = () => {
    const ctx = useContext(TaskCardContext);
    refs.push(ctx);
    return null;
  };
  const task = createTask();
  renderRoot(
    { task, childTasks: [], descendantTasks: [] },
    createElement(Probe),
  );
  renderRoot(
    { task, childTasks: [], descendantTasks: [] },
    createElement(Probe),
  );
  expect(refs.length).toBeGreaterThanOrEqual(2);
  expect(refs[0]).not.toBeNull();
  expect(refs[0]).toBe(refs[1]);
});

test("dragstart で setData / effectAllowed / onDragStart が呼ばれる", () => {
  const onDragStart = vi.fn();
  renderRoot({
    task: createTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
    onDragStart,
  });
  const card = queryCard();
  const event = createDragEvent("dragstart");
  act(() => {
    card.dispatchEvent(event);
  });
  expect(event.dataTransfer.getData(DRAG_MIME_TYPE)).toBe("tasks/a.md");
  expect(event.dataTransfer.effectAllowed).toBe("move");
  expect(onDragStart).toHaveBeenCalledWith("tasks/a.md", "Todo");
});

test("disableDrag=true で onDragStart は呼ばれず draggable=false 属性", () => {
  const onDragStart = vi.fn();
  renderRoot({
    task: createTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
    disableDrag: true,
    onDragStart,
  });
  const card = queryCard();
  expect(card.getAttribute("draggable")).toBe("false");
  const event = createDragEvent("dragstart");
  act(() => {
    card.dispatchEvent(event);
  });
  expect(onDragStart).not.toHaveBeenCalled();
});

test("dragend で onDragEnd + setTimeout(0) 経過後の click は onClick を呼ぶ", () => {
  vi.useFakeTimers();
  try {
    const onClick = vi.fn();
    const onDragEnd = vi.fn();
    renderRoot({ task: createTask({ id: "x" }), onClick, onDragEnd });
    const card = queryCard();
    act(() => {
      card.dispatchEvent(createDragEvent("dragstart"));
    });
    act(() => {
      card.dispatchEvent(createDragEvent("dragend"));
    });
    expect(onDragEnd).toHaveBeenCalled();
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

test("dragend 直後（タイマー未進行）の click は onClick を呼ばない", () => {
  vi.useFakeTimers();
  try {
    const onClick = vi.fn();
    renderRoot({ task: createTask(), onClick });
    const card = queryCard();
    act(() => {
      card.dispatchEvent(createDragEvent("dragstart"));
    });
    act(() => {
      card.dispatchEvent(createDragEvent("dragend"));
    });
    act(() => {
      card.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("onClick 未指定で role / tabIndex 属性なし", () => {
  renderRoot({});
  const card = queryCard();
  expect(card.getAttribute("role")).toBeNull();
  expect(card.getAttribute("tabindex")).toBeNull();
});

test("onClick 指定で role=button + tabIndex=0、Enter / Space で onClick(task.id)", () => {
  const onClick = vi.fn();
  renderRoot({ task: createTask({ id: "btn-1" }), onClick });
  const card = queryCard();
  expect(card.getAttribute("role")).toBe("button");
  expect(card.getAttribute("tabindex")).toBe("0");
  act(() => {
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onClick).toHaveBeenCalledWith("btn-1");
  act(() => {
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
  });
  expect(onClick).toHaveBeenCalledTimes(2);
});

test("isDragging=true で opacity-40 / data-dragging='true' / aria-grabbed", () => {
  renderRoot({ isDragging: true, onClick: vi.fn() });
  const card = queryCard();
  expect(card.className).toContain("opacity-40");
  expect(card.getAttribute("data-dragging")).toBe("true");
  expect(card.getAttribute("aria-grabbed")).toBe("true");
});

test("draft=true で opacity-60", () => {
  renderRoot({ task: createTask({ draft: true }), onClick: vi.fn() });
  const card = queryCard();
  expect(card.className).toContain("opacity-60");
});

test("isDragging=true は draft より優先（opacity-40 のみ、opacity-60 なし）", () => {
  renderRoot({
    task: createTask({ draft: true }),
    isDragging: true,
    onClick: vi.fn(),
  });
  const card = queryCard();
  expect(card.className).toContain("opacity-40");
  expect(card.className).not.toContain("opacity-60");
});
