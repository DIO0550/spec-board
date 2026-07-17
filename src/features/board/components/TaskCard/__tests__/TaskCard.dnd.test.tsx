import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { DRAG_MIME_TYPE } from "../../Board/mime";
import { type BoardCardApi, useBoardCard } from "../../BoardCardProvider";
import { TaskCard } from "..";
import { wrapWithCardProvider } from "./_testHelpers";

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

const makeTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
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
 * BoardCardProvider 配下に TaskCard を mount し、card API を観測する。
 * @param props TaskCard props
 * @param providerArgs Provider に上書きで渡す props（dndDisabled 等）
 * @returns latest cardApi accessor
 */
const render = (
  props: Parameters<typeof TaskCard>[0],
  providerArgs: Parameters<typeof wrapWithCardProvider>[1] = {},
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let latest: BoardCardApi | null = null;
  const handleResult = (api: BoardCardApi) => {
    latest = api;
  };
  act(() => {
    root?.render(
      wrapWithCardProvider(
        <>
          <TaskCard {...props} />
          <CardProbe onResult={handleResult} />
        </>,
        { task: props.task, ...providerArgs },
      ),
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

test.each([
  { name: "onClick あり", onClick: vi.fn() },
  { name: "onClick なし", onClick: undefined },
])("$name でも draggable=true 属性が出力される", ({ onClick }) => {
  render({ task: makeTask(), fromColumn: "Todo", onClick });
  const card = queryCard();
  expect(card.getAttribute("draggable")).toBe("true");
});

test("Provider の dndDisabled=true では draggable=false 属性になる", () => {
  render(
    { task: makeTask(), fromColumn: "Todo", onClick: vi.fn() },
    { dndDisabled: true },
  );
  const card = queryCard();
  expect(card.getAttribute("draggable")).toBe("false");
});

test("Provider の dndDisabled=true では dragstart しても startDrag / setData が呼ばれない", () => {
  const probe = render(
    { task: makeTask({ filePath: "tasks/a.md" }), fromColumn: "Todo" },
    { dndDisabled: true },
  );
  const card = queryCard();
  const event = createDragEvent("dragstart");
  act(() => {
    card.dispatchEvent(event);
  });
  expect(probe.cardApi.isDragging("tasks/a.md")).toBe(false);
  expect(event.dataTransfer.getData(DRAG_MIME_TYPE)).toBe("");
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

test("dragstart で Provider の isDragging(filePath) が true になる", () => {
  const probe = render({
    task: makeTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
    onClick: vi.fn(),
  });
  const card = queryCard();
  act(() => {
    card.dispatchEvent(createDragEvent("dragstart"));
  });
  expect(probe.cardApi.isDragging("tasks/a.md")).toBe(true);
});

test("dragend で Provider の isDragging が false に戻る", () => {
  const probe = render({
    task: makeTask({ filePath: "tasks/a.md" }),
    fromColumn: "Todo",
    onClick: vi.fn(),
  });
  const card = queryCard();
  act(() => {
    card.dispatchEvent(createDragEvent("dragstart"));
  });
  act(() => {
    card.dispatchEvent(createDragEvent("dragend"));
  });
  expect(probe.cardApi.isDragging("tasks/a.md")).toBe(false);
});

test("startDrag 後は data-dragging='true' + opacity-40 class が付く", () => {
  const task = makeTask({ filePath: "tasks/a.md" });
  const probe = render({ task, fromColumn: "Todo", onClick: vi.fn() });
  act(() => {
    probe.cardApi.startDrag(task.filePath, "Todo");
  });
  const card = queryCard();
  expect(card.getAttribute("data-dragging")).toBe("true");
  expect(card.className).toContain("opacity-40");
});

test("idle 状態では data-dragging 属性が存在しない", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
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
