import { act, type ReactNode, useContext, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { Task, type TaskPayload } from "@/types/task";
import { DRAG_MIME_TYPE } from "../../../Board/mime";
import {
  type BoardCardApi,
  BoardCardProvider,
  type BoardCardProviderProps,
  useBoardCard,
} from "../../../BoardCardProvider";
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

/**
 * BoardCardProvider から最新の API を取得する Probe。
 * @param props 最新値を受け取るコールバック
 * @returns null
 */
const CardProbe = (props: { onResult: (api: BoardCardApi) => void }) => {
  const api = useBoardCard();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * BoardCardProvider 配下に TaskCardRoot を mount する。
 * @param props TaskCardRoot に渡す props 上書き（task / fromColumn は default あり）
 * @param children TaskCardRoot 配下に描画する React 要素
 * @param providerOverrides BoardCardProvider に追加で渡す props
 * @returns latest cardApi accessor
 */
const renderRoot = (
  props: Partial<TaskCardRootProps> = {},
  children: ReactNode = null,
  providerOverrides: Partial<Omit<BoardCardProviderProps, "children">> = {},
) => {
  const merged: TaskCardRootProps = {
    task: createTask(),
    fromColumn: "Todo",
    ...props,
    children,
  };
  let latest: BoardCardApi | null = null;
  const handleResult = (api: BoardCardApi) => {
    latest = api;
  };
  act(() => {
    root?.render(
      <BoardCardProvider
        tasks={[merged.task]}
        allTasks={[merged.task]}
        projections={TaskProjection.emptyMap}
        {...providerOverrides}
      >
        <TaskCardRoot {...merged} />
        <CardProbe onResult={handleResult} />
      </BoardCardProvider>,
    );
  });
  return {
    get cardApi(): BoardCardApi {
      return latest as BoardCardApi;
    },
  };
};

const queryCard = (): HTMLElement => {
  const el = container?.querySelector<HTMLElement>("[data-testid='task-card']");
  expect(el).not.toBeNull();
  return el as HTMLElement;
};

test("active=true は選択中カードをdata属性とaccent ringで示す", () => {
  renderRoot({ active: true });

  const card = queryCard();
  expect(card.getAttribute("data-active")).toBe("true");
  expect(card.className).toContain("ring-accent");
});

test("Context Value は依存不変なら同一参照（useMemo）", () => {
  const refs: (TaskCardContextValue | null)[] = [];
  const Probe = () => {
    const ctx = useContext(TaskCardContext);
    refs.push(ctx);
    return null;
  };
  const task = createTask();
  const childTasks: readonly Task[] = [];
  renderRoot({ task, childTasks }, <Probe />);
  renderRoot({ task, childTasks }, <Probe />);
  expect(refs.length).toBeGreaterThanOrEqual(2);
  expect(refs[0]).not.toBeNull();
  expect(refs[0]).toBe(refs[1]);
});

test("childTasks 未指定でも 2 回連続レンダーで Context Value 参照が安定する", () => {
  const refs: (TaskCardContextValue | null)[] = [];
  const Probe = () => {
    const ctx = useContext(TaskCardContext);
    refs.push(ctx);
    return null;
  };
  const task = createTask();
  renderRoot({ task }, <Probe />);
  renderRoot({ task }, <Probe />);
  expect(refs.length).toBeGreaterThanOrEqual(2);
  expect(refs[0]).not.toBeNull();
  expect(refs[0]).toBe(refs[1]);
});

test("childTasks に都度新規の空配列を渡しても Context Value 参照が安定する", () => {
  const refs: (TaskCardContextValue | null)[] = [];
  const Probe = () => {
    const ctx = useContext(TaskCardContext);
    refs.push(ctx);
    return null;
  };
  const task = createTask();
  renderRoot({ task, childTasks: [] }, <Probe />);
  renderRoot({ task, childTasks: [] }, <Probe />);
  expect(refs.length).toBeGreaterThanOrEqual(2);
  expect(refs[0]).not.toBeNull();
  expect(refs[0]).toBe(refs[1]);
});

test("dragstart で setData / effectAllowed / Provider の isDragging が true", () => {
  const probe = renderRoot({
    task: createTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
  });
  const card = queryCard();
  const event = createDragEvent("dragstart");
  act(() => {
    card.dispatchEvent(event);
  });
  expect(event.dataTransfer.getData(DRAG_MIME_TYPE)).toBe("tasks/a.md");
  expect(event.dataTransfer.effectAllowed).toBe("move");
  expect(probe.cardApi.isDragging("tasks/a.md")).toBe(true);
});

test("Provider の dndDisabled=true で dragstart が no-op になり draggable=false 属性", () => {
  const probe = renderRoot(
    {
      task: createTask({ filePath: "tasks/a.md" }),
      fromColumn: "Todo",
    },
    null,
    { dndDisabled: true },
  );
  const card = queryCard();
  expect(card.getAttribute("draggable")).toBe("false");
  const event = createDragEvent("dragstart");
  act(() => {
    card.dispatchEvent(event);
  });
  expect(probe.cardApi.isDragging("tasks/a.md")).toBe(false);
});

test("dragend で Provider の isDragging が false に戻り setTimeout(0) 経過後の click は onClick を呼ぶ", () => {
  vi.useFakeTimers();
  try {
    const onClick = vi.fn();
    const task = createTask({ id: "x" });
    const probe = renderRoot({ task, onClick });
    const card = queryCard();
    act(() => {
      card.dispatchEvent(createDragEvent("dragstart"));
    });
    act(() => {
      card.dispatchEvent(createDragEvent("dragend"));
    });
    expect(probe.cardApi.isDragging(task.filePath)).toBe(false);
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

test("startDrag 後は opacity-40 / data-dragging='true' / aria-grabbed", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  const probe = renderRoot({ task, onClick: vi.fn() });
  act(() => {
    probe.cardApi.startDrag(task.filePath, "Todo");
  });
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

test("startDrag 中の draft は dragging の opacity-40 を優先し opacity-60 は付かない", () => {
  const task = createTask({ filePath: "tasks/a.md", draft: true });
  const probe = renderRoot({ task, onClick: vi.fn() });
  act(() => {
    probe.cardApi.startDrag(task.filePath, "Todo");
  });
  const card = queryCard();
  expect(card.className).toContain("opacity-40");
  expect(card.className).not.toContain("opacity-60");
});
