import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildTasksByNormalizedPath } from "@/domains/broken-link";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { DetailPanel } from "..";

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

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

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

const render = (props: Parameters<typeof DetailPanel>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailPanel, props));
  });
};

test("parent broken + parentTask 解決不可: BrokenParentRow が描画される", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    parent: "tasks/missing.md",
  });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    tasksByNormalizedPath: buildTasksByNormalizedPath([task]),
  });
  const row = document.querySelector('[data-testid="broken-parent-row"]');
  expect(row).not.toBeNull();
  expect(row?.textContent).toContain("tasks/missing.md");
});

test("links の broken 要素に WarningIcon が出る (LinksSection 経由)", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    links: ["tasks/dead.md"],
  });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(task)),
    tasksByNormalizedPath: buildTasksByNormalizedPath([task]),
  });
  const row = document.querySelector(
    '[data-testid="links-section-linked-tasks/dead.md"]',
  );
  expect(row?.getAttribute("data-broken")).toBe("true");
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
});

test("reverseLinks の broken 要素も WarningIcon が出る", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/gone.md"],
  });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(task)),
    tasksByNormalizedPath: buildTasksByNormalizedPath([task]),
  });
  const row = document.querySelector(
    '[data-testid="links-section-reverse-tasks/gone.md"]',
  );
  expect(row?.getAttribute("data-broken")).toBe("true");
});

test("children の broken 要素が SubIssueSection で表示される", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    children: ["tasks/dead.md"],
  });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddSubIssue: vi.fn(),
    tasksByNormalizedPath: buildTasksByNormalizedPath([task]),
  });
  const row = document.querySelector(
    '[data-testid="sub-issue-broken-tasks/dead.md"]',
  );
  expect(row).not.toBeNull();
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
});

test("何も broken でないタスク: BrokenParentRow / WarningIcon が描画されない", () => {
  const other = createTask({
    filePath: "tasks/other.md",
    title: "他",
  });
  const task = createTask({
    filePath: "tasks/self.md",
    parent: "tasks/other.md",
    links: ["tasks/other.md"],
  });
  render({
    task,
    columns: testColumns,
    allTasks: [task, other],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(task)),
    onAddSubIssue: vi.fn(),
    tasksByNormalizedPath: buildTasksByNormalizedPath([task, other]),
  });
  expect(
    document.querySelector('[data-testid="broken-parent-row"]'),
  ).toBeNull();
  expect(document.querySelectorAll('[data-testid="warning-icon"]').length).toBe(
    0,
  );
});

test("tasksByNormalizedPath 未指定なら broken 表示が一切出ない (後方互換)", () => {
  const task = createTask({
    filePath: "tasks/self.md",
    parent: "tasks/missing.md",
    links: ["tasks/dead.md"],
    children: ["tasks/orphan.md"],
  });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(task)),
    onAddSubIssue: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="broken-parent-row"]'),
  ).toBeNull();
  expect(document.querySelectorAll('[data-testid="warning-icon"]').length).toBe(
    0,
  );
});
