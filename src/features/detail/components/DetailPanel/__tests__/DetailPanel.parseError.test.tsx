import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload, type TaskWarning } from "@/types/task";
import { DetailPanel } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

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
 * @param warnings - 注入する warnings 配列
 * @returns テスト用タスク
 */
function createTaskWithWarnings(warnings: TaskWarning[]): Task {
  const payload: TaskPayload = {
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "本文",
    filePath: "tasks/test.md",
    extras: {},
    warnings,
  };
  return Task.fromPayload(payload);
}

/**
 * DetailPanel をレンダリングするヘルパー
 * @param task - 渡すタスク
 */
function render(task: Task) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(DetailPanel, {
        task,
        columns: testColumns,
        onClose: vi.fn(),
        onTaskUpdate: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
  });
}

const invalidWarning: TaskWarning = {
  code: "invalidStatusUsedDefault",
  field: "status",
  message: "invalid status, used default",
};
const cycleWarning: TaskWarning = {
  code: "parentCycle",
  field: "parent",
  message: "parent chain forms a cycle",
};

test("invalid warning を持つタスクの DetailPanel に role=alert パースエラーバナーが表示される", () => {
  render(createTaskWithWarnings([invalidWarning]));
  const banner = document.querySelector(
    '[data-testid="parse-error-banner"][role="alert"]',
  );
  expect(banner).not.toBeNull();
});

test("warnings 空のタスクではパースエラーバナーが表示されない", () => {
  render(createTaskWithWarnings([]));
  expect(
    document.querySelector('[data-testid="parse-error-banner"]'),
  ).toBeNull();
});

test("除外コード（parentCycle）のみのタスクではパースエラーバナーが表示されない", () => {
  render(createTaskWithWarnings([cycleWarning]));
  expect(
    document.querySelector('[data-testid="parse-error-banner"]'),
  ).toBeNull();
});
