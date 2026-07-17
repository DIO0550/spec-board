import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
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

const createTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
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
 * BoardCardProvider 配下に TaskCard を mount する。
 * @param props TaskCard props（fromColumn はデフォルト "Todo"）
 * @returns latest cardApi accessor
 */
const render = (props: Omit<Parameters<typeof TaskCard>[0], "fromColumn">) => {
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
          <TaskCard fromColumn="Todo" {...props} />
          <CardProbe onResult={handleResult} />
        </>,
        { task: props.task },
      ),
    );
  });
  return {
    get cardApi(): BoardCardApi {
      return latest as BoardCardApi;
    },
  };
};

const card = (): HTMLElement | null =>
  container?.querySelector('[data-testid="task-card"]') ?? null;

test("draft タスクは「下書き」バッジとグレー表示クラスが付与される", () => {
  render({ task: createTask({ draft: true }), onClick: vi.fn() });
  const badge = container?.querySelector('[data-testid="draft-badge"]');
  expect(badge?.textContent).toBe("下書き");
  expect(card()?.className).toContain("opacity-60");
});

test("通常タスクはバッジなし・グレー表示クラスなし（リグレッション）", () => {
  render({ task: createTask(), onClick: vi.fn() });
  expect(container?.querySelector('[data-testid="draft-badge"]')).toBeNull();
  expect(card()?.className).not.toContain("opacity-60");
});

test("draft タスクでもカード自体は描画される（非表示にしない）", () => {
  render({ task: createTask({ draft: true }), onClick: vi.fn() });
  expect(card()).toBeTruthy();
  expect(
    container?.querySelector('[data-testid="task-card-title"]')?.textContent,
  ).toBe("テストタスク");
});

test("ドラッグ中の draft タスクは dragging の減光を優先し opacity を重複適用しない", () => {
  const task = createTask({ draft: true });
  const probe = render({ task, onClick: vi.fn() });
  act(() => {
    probe.cardApi.startDrag(task.filePath, "Todo");
  });
  const className = card()?.className ?? "";
  expect(className).toContain("opacity-40");
  expect(className).not.toContain("opacity-60");
});
