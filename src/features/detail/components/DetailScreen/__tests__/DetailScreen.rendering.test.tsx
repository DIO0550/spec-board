import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { buildTasksByNormalizedPath } from "@/domains/broken-link";
import { Task, type TaskPayload, type TaskWarning } from "@/types/task";
import { Result } from "@/utils/result";
import { DetailScreen } from "..";

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
    body: "# 見出し",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * DetailScreen の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailScreen の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof DetailScreen>[0]> = {},
): Parameters<typeof DetailScreen>[0] {
  return {
    task: overrides.task ?? createTask(),
    columns: testColumns,
    onBack: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

/**
 * DetailScreen をレンダリングするヘルパー
 * @param props - DetailScreen に渡す props
 */
function render(props: Parameters<typeof DetailScreen>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailScreen, props));
  });
}

test("左ペインに本文（タイトル + Markdown）が描画される", () => {
  render(buildProps({ task: createTask({ title: "詳細タスク" }) }));
  const title = document.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement | null;
  expect(title?.value).toBe("詳細タスク");
  expect(document.querySelector('[data-testid="markdown-body"]')).toBeTruthy();
});

test("右ペインにプロパティ（Status 等）と削除ボタンが描画される", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="detail-delete-button"]'),
  ).toBeTruthy();
});

test("「← 戻る」ボタンが描画される", () => {
  render(buildProps());
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();
});

/**
 * warnings を注入したテスト用タスクを生成する。
 * @param warnings - 注入する warnings 配列
 * @returns テスト用タスク
 */
const createTaskWithWarnings = (warnings: TaskWarning[]): Task =>
  Task.fromPayload({
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
  });

test("サイドバーに status/priority/labels セクションが揃って表示される", () => {
  render(buildProps());
  expect(document.querySelector('[data-testid="status-select"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="priority-select"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="label-add-button"]'),
  ).toBeTruthy();
});

test("onAddSubIssue + allTasks 指定時に sub-issue セクションが表示される", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  render(buildProps({ task, allTasks: [task], onAddSubIssue: vi.fn() }));
  expect(
    document.querySelector('[data-testid="sub-issue-section"]'),
  ).toBeTruthy();
});

test("parentCycle warning を持つタスクで循環バナーが表示される", () => {
  render(
    buildProps({
      task: createTaskWithWarnings([
        { code: "parentCycle", field: "parent", message: "cycle" },
      ]),
    }),
  );
  expect(
    document.querySelector(
      '[data-testid="cycle-warning-banner"][role="alert"]',
    ),
  ).not.toBeNull();
});

test("warning が無いタスクでは循環バナーが表示されない", () => {
  render(buildProps({ task: createTaskWithWarnings([]) }));
  expect(
    document.querySelector('[data-testid="cycle-warning-banner"]'),
  ).toBeNull();
});

test("invalid warning を持つタスクで parse-error バナーが表示される", () => {
  render(
    buildProps({
      task: createTaskWithWarnings([
        {
          code: "invalidStatusUsedDefault",
          field: "status",
          message: "invalid",
        },
      ]),
    }),
  );
  expect(
    document.querySelector('[data-testid="parse-error-banner"][role="alert"]'),
  ).not.toBeNull();
});

test("parent broken + 解決不可: BrokenParentRow が描画される", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    parent: "tasks/missing.md",
  });
  render(
    buildProps({
      task,
      allTasks: [task],
      tasksByNormalizedPath: buildTasksByNormalizedPath([task]),
    }),
  );
  const row = document.querySelector('[data-testid="broken-parent-row"]');
  expect(row).not.toBeNull();
  expect(row?.textContent).toContain("tasks/missing.md");
});

test("links の broken 要素に WarningIcon が出る", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    links: ["tasks/dead.md"],
  });
  render(
    buildProps({
      task,
      allTasks: [task],
      onAddLink: vi.fn(async () => Result.ok(task)),
      tasksByNormalizedPath: buildTasksByNormalizedPath([task]),
    }),
  );
  const row = document.querySelector('[data-testid="links-section-linked-0"]');
  expect(row?.getAttribute("data-broken")).toBe("true");
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
});

test("狭幅は縦積み・md 以上は横2ペイン（左ペインに padding クラス）", () => {
  render(buildProps());
  const section = document.querySelector(
    'section[aria-label="タスク詳細"]',
  ) as HTMLElement;
  expect(section.className).toContain("flex-col");
  expect(section.className).toContain("md:flex-row");
  const leftPane = Array.from(section.children).find((el) =>
    el.className.includes("md:p-6"),
  ) as HTMLElement;
  expect(leftPane).toBeTruthy();
});
