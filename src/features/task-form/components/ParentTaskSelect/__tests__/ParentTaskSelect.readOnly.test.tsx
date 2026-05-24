import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { ParentTaskSelect } from "..";

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

/**
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function makeTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "t-1",
    title: "親候補",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/candidate.md",
    ...overrides,
  });
}

/**
 * ParentTaskSelect をレンダリングするヘルパー
 * @param props - ParentTaskSelect に渡す props
 */
function render(props: Parameters<typeof ParentTaskSelect>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ParentTaskSelect, props));
  });
}

test("readOnly=true で selected あり → × ボタンが描画されない", () => {
  const task = makeTask({
    id: "t-1",
    title: "親",
    filePath: "tasks/parent.md",
  });
  render({
    tasks: [task],
    value: "tasks/parent.md",
    onChange: vi.fn(),
    readOnly: true,
  });
  expect(
    document.querySelector('[data-testid="parent-task-selected"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="parent-task-clear"]'),
  ).toBeNull();
});

test("readOnly=true && value が tasks 不在 → filePath fallback + × 非描画", () => {
  render({
    tasks: [],
    value: "tasks/missing.md",
    onChange: vi.fn(),
    readOnly: true,
  });
  const selected = document.querySelector(
    '[data-testid="parent-task-selected"]',
  );
  expect(selected).toBeTruthy();
  expect(selected?.textContent).toBe("tasks/missing.md");
  expect(
    document.querySelector('[data-testid="parent-task-clear"]'),
  ).toBeNull();
});

test("readOnly=false && value が tasks 不在 → filePath fallback + × 描画", () => {
  render({
    tasks: [],
    value: "tasks/missing.md",
    onChange: vi.fn(),
    readOnly: false,
  });
  const selected = document.querySelector(
    '[data-testid="parent-task-selected"]',
  );
  expect(selected).toBeTruthy();
  expect(selected?.textContent).toBe("tasks/missing.md");
  expect(
    document.querySelector('[data-testid="parent-task-clear"]'),
  ).toBeTruthy();
});
