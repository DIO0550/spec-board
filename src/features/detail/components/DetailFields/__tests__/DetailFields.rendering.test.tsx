import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { BrokenLinkSet } from "@/domains/broken-link";
import { Task, type TaskPayload } from "@/types/task";
import { DetailFields } from "..";

/** リンク切れなしの BrokenLinkSet */
const noBrokenLinks: BrokenLinkSet = {
  parent: false,
  links: new Set<string>(),
  children: new Set<string>(),
  reverseLinks: new Set<string>(),
};

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
 * DetailFields の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailFields の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof DetailFields>[0]> = {},
): Parameters<typeof DetailFields>[0] {
  const task = overrides.task ?? createTask();
  return {
    task,
    columns: testColumns,
    childTasks: [],
    descendantTasks: [],
    effectiveDoneColumn: "Done",
    parentTask: null,
    brokenLinks: noBrokenLinks,
    onStatusChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onLabelAdd: vi.fn(),
    onLabelRemove: vi.fn(),
    ...overrides,
  };
}

/**
 * DetailFields をレンダリングするヘルパー
 * @param props - DetailFields に渡す props
 */
function render(props: Parameters<typeof DetailFields>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailFields, props));
  });
}

test("StatusSelect / PrioritySelect が描画される", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="priority-select"]'),
  ).toBeTruthy();
});

test("LabelEditor が描画される", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="label-editor"]')).toBeTruthy();
});

test("onAddSubIssue + allTasks ありで SubIssueSection が描画される", () => {
  const task = createTask({ filePath: "tasks/parent.md" });
  render(buildProps({ task, allTasks: [task], onAddSubIssue: vi.fn() }));
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeTruthy();
});

test("onAddLink + allTasks ありで LinksSection が描画される", () => {
  const task = createTask();
  render(buildProps({ task, allTasks: [task], onAddLink: vi.fn() }));
  expect(document.querySelector('[data-testid="links-section"]')).toBeTruthy();
});

test("onAddLink 無しでは LinksSection が描画されない（後方互換）", () => {
  const task = createTask();
  render(buildProps({ task, allTasks: [task] }));
  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
});

test("allTasks 無しでは SubIssueSection が描画されない", () => {
  render(buildProps({ onAddSubIssue: vi.fn() }));
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeNull();
});
