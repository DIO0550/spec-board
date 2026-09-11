import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { createDetailWrapper } from "../../DetailProvider/wrapper";
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
  const Wrapper = createDetailWrapper({
    task: createTask(),
    columns: testColumns,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.StatusPriority />
      </DetailFields>
    </Wrapper>,
  );
  expect(document.querySelector('[data-testid="status-field"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="priority-field"]')).toBeTruthy();
});

test("Labels で ラベル選択フィールドが描画される", () => {
  const Wrapper = createDetailWrapper({
    task: createTask(),
    columns: testColumns,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Labels />
      </DetailFields>
    </Wrapper>,
  );
  expect(document.querySelector('[data-testid="detail-labels"]')).toBeTruthy();
});

test("SubIssue で SubIssueSection が描画される", () => {
  const task = createTask({ filePath: "tasks/parent.md" });
  const Wrapper = createDetailWrapper({
    task,
    columns: testColumns,
    allTasks: [task],
    onAddSubIssue: vi.fn(),
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.SubIssue />
      </DetailFields>
    </Wrapper>,
  );
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeTruthy();
});

test("Links で LinksSection が描画される", () => {
  const task = createTask();
  const Wrapper = createDetailWrapper({
    task,
    columns: testColumns,
    allTasks: [task],
    onAddLink: vi.fn(async () => Result.ok(task)),
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Links />
      </DetailFields>
    </Wrapper>,
  );
  expect(document.querySelector('[data-testid="links-section"]')).toBeTruthy();
});

test("呼び出し側が並べた部品のみが描画される（Links を並べなければ非描画）", () => {
  const Wrapper = createDetailWrapper({
    task: createTask(),
    columns: testColumns,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.StatusPriority />
        <DetailFields.Labels />
      </DetailFields>
    </Wrapper>,
  );
  expect(document.querySelector('[data-testid="status-field"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeNull();
});

test("onAddSubIssue 未指定なら SubIssue を並べても描画しない", () => {
  const task = createTask();
  const Wrapper = createDetailWrapper({
    task,
    columns: testColumns,
    allTasks: [task],
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.SubIssue />
      </DetailFields>
    </Wrapper>,
  );
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeNull();
});

test("onAddLink 未指定なら Links を並べても描画しない", () => {
  const task = createTask();
  const Wrapper = createDetailWrapper({
    task,
    columns: testColumns,
    allTasks: [task],
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Links />
      </DetailFields>
    </Wrapper>,
  );
  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
});
