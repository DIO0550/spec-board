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

const cycleWarning: TaskWarning = {
  code: "parentCycle",
  field: "parent",
  message: "parent chain forms a cycle",
};

test("parentCycle warning を持つタスクの DetailPanel に role=alert バナーが表示される", () => {
  render(createTaskWithWarnings([cycleWarning]));
  const banner = document.querySelector(
    '[data-testid="cycle-warning-banner"][role="alert"]',
  );
  expect(banner).not.toBeNull();
});

test("warning が無いタスクでは循環バナーが表示されない", () => {
  render(createTaskWithWarnings([]));
  const banner = document.querySelector('[data-testid="cycle-warning-banner"]');
  expect(banner).toBeNull();
});

test("循環バナーはタスクタイトル入力より DOM 上で前に出る", () => {
  render(createTaskWithWarnings([cycleWarning]));
  const banner = document.querySelector(
    '[data-testid="cycle-warning-banner"]',
  );
  const titleInput = document.querySelector(
    '[aria-label="タスクタイトル"]',
  );
  expect(banner).not.toBeNull();
  expect(titleInput).not.toBeNull();
  const relation = banner?.compareDocumentPosition(titleInput as Node) ?? 0;
  expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
});
