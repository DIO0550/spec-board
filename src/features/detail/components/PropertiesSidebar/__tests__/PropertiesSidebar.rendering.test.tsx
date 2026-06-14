import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { BrokenLinkSet } from "@/domains/broken-link";
import type { UseDeleteFlowResult } from "@/features/detail/hooks/useDeleteFlow";
import { Task, type TaskPayload } from "@/types/task";
import { PropertiesSidebar } from "..";

/** リンク切れなしの BrokenLinkSet */
const noBrokenLinks: BrokenLinkSet = {
  parent: false,
  links: new Set<string>(),
  children: new Set<string>(),
  reverseLinks: new Set<string>(),
};

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
      descendantTasks: [],
      effectiveDoneColumn: "Done",
    },
    parentTask: null,
    brokenLinks: noBrokenLinks,
    handlers: {
      onStatusChange: vi.fn(),
      onPriorityChange: vi.fn(),
      onLabelAdd: vi.fn(),
      onLabelRemove: vi.fn(),
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

test("DetailFields（Status 等）が描画される", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
});

test("parentTask あり + onSelectTask で ParentLink が描画される（サイドバー集約）", () => {
  const parent = createTask({ id: "p", title: "親", filePath: "tasks/p.md" });
  const child = createTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
  });
  render(
    buildProps({ task: child, parentTask: parent, onSelectTask: vi.fn() }),
  );
  expect(
    document.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeTruthy();
});

test("parentTask 無し + brokenLinks.parent で BrokenParentRow が描画される", () => {
  const child = createTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/missing.md",
  });
  render(
    buildProps({
      task: child,
      parentTask: null,
      brokenLinks: { ...noBrokenLinks, parent: true },
      onSelectTask: vi.fn(),
    }),
  );
  expect(
    document.querySelector('[data-testid="broken-parent-row"]'),
  ).toBeTruthy();
});

test("削除ボタンが描画される", () => {
  render(buildProps());
  expect(
    document.querySelector('[data-testid="detail-delete-button"]'),
  ).toBeTruthy();
});

test("削除ボタンに focus-visible リング（red）クラスを含む（DetailScreen とトーン統一）", () => {
  render(buildProps());
  const cls = (
    document.querySelector(
      '[data-testid="detail-delete-button"]',
    ) as HTMLElement
  ).className;
  expect(cls).toContain("focus-visible:ring-2");
  expect(cls).toContain("focus-visible:ring-red-500");
});
