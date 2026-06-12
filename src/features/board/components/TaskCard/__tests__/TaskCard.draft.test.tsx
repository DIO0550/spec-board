import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
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

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
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

const render = (props: Omit<Parameters<typeof TaskCard>[0], "fromColumn">) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskCard, { fromColumn: "Todo", ...props }));
  });
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
  render({
    task: createTask({ draft: true }),
    isDragging: true,
    onClick: vi.fn(),
  });
  const className = card()?.className ?? "";
  expect(className).toContain("opacity-40");
  expect(className).not.toContain("opacity-60");
});
