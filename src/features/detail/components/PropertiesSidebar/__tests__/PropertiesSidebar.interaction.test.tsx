import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { BrokenLinkSet } from "@/domains/broken-link";
import type { UseDeleteFlowResult } from "@/features/detail/hooks/useDeleteFlow";
import { Task, type TaskPayload } from "@/types/task";
import { PropertiesSidebar } from "..";

/** リンク切れなしの BrokenLinkSet */
const noBrokenLinks = BrokenLinkSet.empty;

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
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "本文",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * 削除フロー（DetailScreen が所有する state）のスタブを生成する。
 * @param overrides - 上書きするフィールド
 * @returns UseDeleteFlowResult スタブ
 */
function buildDeleteFlow(
  overrides: Partial<UseDeleteFlowResult> = {},
): UseDeleteFlowResult {
  return {
    isOpen: false,
    isBusy: false,
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(),
    ...overrides,
  };
}

/**
 * PropertiesSidebar の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns PropertiesSidebar の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof PropertiesSidebar>[0]> = {},
): Parameters<typeof PropertiesSidebar>[0] {
  const task = overrides.task ?? createTask();
  return {
    task,
    columns: testColumns,
    childInfo: {
      childTasks: [],
      subIssueCounts: { done: 0, total: 0 },
      isDone: () => false,
    },
    parentTask: null,
    brokenLinks: noBrokenLinks,
    handlers: {
      onStatusChange: vi.fn(),
      onPriorityChange: vi.fn(),
      onLabelsChange: vi.fn(),
      onChangeDraft: vi.fn(),
    },
    deleteFlow: buildDeleteFlow(),
    orphanStrategy: "clear",
    onOrphanStrategyChange: vi.fn(),
    ...overrides,
  };
}

/**
 * PropertiesSidebar をレンダリングするヘルパー
 * @param props - PropertiesSidebar に渡す props
 */
function render(props: Parameters<typeof PropertiesSidebar>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PropertiesSidebar, props));
  });
}

/**
 * 指定 testid の要素を click する。
 * @param testId - data-testid
 */
const click = (testId: string): void => {
  act(() => {
    (
      document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
    ).click();
  });
};

test("削除ボタン押下で deleteFlow.requestDelete が呼ばれる", () => {
  const requestDelete = vi.fn();
  render(buildProps({ deleteFlow: buildDeleteFlow({ requestDelete }) }));
  click("detail-delete-button");
  expect(requestDelete).toHaveBeenCalledTimes(1);
});

test("deleteFlow.isOpen が false の間は ConfirmDialog を描画しない", () => {
  render(buildProps({ deleteFlow: buildDeleteFlow({ isOpen: false }) }));
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
});

test("deleteFlow.isOpen が true なら ConfirmDialog を描画する", () => {
  render(buildProps({ deleteFlow: buildDeleteFlow({ isOpen: true }) }));
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();
});

test("確定ボタン押下で deleteFlow.confirmDelete が呼ばれる", () => {
  const confirmDelete = vi.fn();
  render(
    buildProps({
      deleteFlow: buildDeleteFlow({ isOpen: true, confirmDelete }),
    }),
  );
  click("confirm-confirm-button");
  expect(confirmDelete).toHaveBeenCalledTimes(1);
});

test("キャンセルボタン押下で deleteFlow.cancelDelete が呼ばれる", () => {
  const cancelDelete = vi.fn();
  render(
    buildProps({ deleteFlow: buildDeleteFlow({ isOpen: true, cancelDelete }) }),
  );
  click("confirm-cancel-button");
  expect(cancelDelete).toHaveBeenCalledTimes(1);
});

test("子あり: abort ラジオ選択で onOrphanStrategyChange('abort') が呼ばれる", () => {
  const onOrphanStrategyChange = vi.fn();
  render(
    buildProps({
      task: createTask({ children: ["a.md"] }),
      deleteFlow: buildDeleteFlow({ isOpen: true }),
      onOrphanStrategyChange,
    }),
  );
  click("delete-orphan-strategy-abort");
  expect(onOrphanStrategyChange).toHaveBeenCalledWith("abort");
});

test("子あり: orphanStrategy='abort' なら abort ラジオが checked", () => {
  render(
    buildProps({
      task: createTask({ children: ["a.md"] }),
      deleteFlow: buildDeleteFlow({ isOpen: true }),
      orphanStrategy: "abort",
    }),
  );
  const abort = document.querySelector(
    '[data-testid="delete-orphan-strategy-abort"]',
  ) as HTMLInputElement;
  expect(abort.checked).toBe(true);
});
