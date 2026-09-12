import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskPathLookup } from "@/domains/task-path-lookup";
import { createDeleteFlowWrapper } from "@/features/detail/providers/DeleteFlowProvider/wrapper";
import { createDetailWrapper } from "@/features/detail/providers/DetailProvider/wrapper";
import { Task, type TaskPayload } from "@/types/task";
import { PropertiesSidebar } from "..";

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

/** render に渡す引数（両 Provider の上書きと PropertiesSidebar の props） */
type RenderArgs = {
  detail?: Parameters<typeof createDetailWrapper>[0];
  deleteFlow?: Parameters<typeof createDeleteFlowWrapper>[0];
  onArchive?: () => void;
};

/**
 * 両 Provider 配下に PropertiesSidebar を mount する。task は両 Provider に同じものを渡す。
 * @param args - detail / deleteFlow の wrapper 引数と onArchive
 */
function render(args: RenderArgs = {}) {
  const task = args.detail?.task ?? createTask();
  const Detail = createDetailWrapper({
    task,
    columns: testColumns,
    ...args.detail,
  });
  const DeleteFlow = createDeleteFlowWrapper({ task, ...args.deleteFlow });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <Detail>
        <DeleteFlow>
          <PropertiesSidebar onArchive={args.onArchive} />
        </DeleteFlow>
      </Detail>,
    );
  });
}

test("DetailFields（Status 等）が描画される", () => {
  render();
  expect(document.querySelector('[data-testid="status-field"]')).toBeTruthy();
});

test("allTasks に親がいる + onSelectTask で ParentLink が描画される（サイドバー集約）", () => {
  const parent = createTask({ id: "p", title: "親", filePath: "tasks/p.md" });
  const child = createTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
  });
  render({
    detail: { task: child, allTasks: [parent, child], onSelectTask: vi.fn() },
  });
  expect(
    document.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeTruthy();
});

test("lookup に親が無い（broken parent）なら BrokenParentRow が描画される", () => {
  const child = createTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/missing.md",
  });
  render({
    detail: {
      task: child,
      allTasks: [child],
      tasksByNormalizedPath: TaskPathLookup.fromTasks([child]),
      onSelectTask: vi.fn(),
    },
  });
  expect(
    document.querySelector('[data-testid="broken-parent-row"]'),
  ).toBeTruthy();
});

test("削除ボタンが描画される", () => {
  render();
  expect(
    document.querySelector('[data-testid="detail-delete-button"]'),
  ).toBeTruthy();
});

test("削除ボタンに focus-visible リング（red）クラスを含む（DetailScreen とトーン統一）", () => {
  render();
  const cls = (
    document.querySelector(
      '[data-testid="detail-delete-button"]',
    ) as HTMLElement
  ).className;
  expect(cls).toContain("focus-visible:ring-2");
  expect(cls).toContain("focus-visible:ring-red-500");
});
