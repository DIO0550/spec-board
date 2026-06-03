import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { UseChildTasksResult } from "@/features/detail/hooks/useChildTasks";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { DetailFields } from "..";

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
 * テスト用の編集ハンドラ群を生成する。
 * @returns DetailFieldHandlers
 */
const createHandlers = (): DetailFieldHandlers => ({
  onStatusChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onLabelAdd: vi.fn(),
  onLabelRemove: vi.fn(),
});

/** 空の子タスク解決結果 */
const emptyChildInfo: UseChildTasksResult = {
  childTasks: [],
  descendantTasks: [],
  effectiveDoneColumn: "Done",
};

/**
 * 任意の React 要素をレンダリングするヘルパー
 * @param node - レンダリング対象
 */
function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
}

test("StatusPriority で Status/Priority が描画される", () => {
  render(
    <DetailFields
      task={createTask()}
      columns={testColumns}
      handlers={createHandlers()}
    >
      <DetailFields.StatusPriority />
    </DetailFields>,
  );
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="priority-select"]'),
  ).toBeTruthy();
});

test("Labels で LabelEditor が描画される", () => {
  render(
    <DetailFields
      task={createTask()}
      columns={testColumns}
      handlers={createHandlers()}
    >
      <DetailFields.Labels />
    </DetailFields>,
  );
  expect(document.querySelector('[data-testid="label-editor"]')).toBeTruthy();
});

test("SubIssue で SubIssueSection が描画される", () => {
  const task = createTask({ filePath: "tasks/parent.md" });
  render(
    <DetailFields task={task} columns={testColumns} handlers={createHandlers()}>
      <DetailFields.SubIssue
        childInfo={emptyChildInfo}
        brokenChildPaths={new Set()}
        onAddSubIssue={vi.fn()}
      />
    </DetailFields>,
  );
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeTruthy();
});

test("Links で LinksSection が描画される", () => {
  const task = createTask();
  render(
    <DetailFields task={task} columns={testColumns} handlers={createHandlers()}>
      <DetailFields.Links
        allTasks={[task]}
        parentFilePath={null}
        childrenFilePaths={[]}
        onAddLink={vi.fn(async () => Result.ok(task))}
        brokenLinkPaths={new Set()}
        brokenReverseLinkPaths={new Set()}
      />
    </DetailFields>,
  );
  expect(document.querySelector('[data-testid="links-section"]')).toBeTruthy();
});

test("呼び出し側が並べた部品のみが描画される（Links を並べなければ非描画）", () => {
  render(
    <DetailFields
      task={createTask()}
      columns={testColumns}
      handlers={createHandlers()}
    >
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
    </DetailFields>,
  );
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeNull();
});
