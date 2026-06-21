import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardHeader } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

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
    id: "task-1",
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

const baseValue = (
  overrides: Partial<TaskCardContextValue> = {},
): TaskCardContextValue => ({
  task: createTask(),
  doneColumn: "Done",
  milestonesByName: undefined,
  hasBrokenLink: false,
  hasParseError: false,
  subIssueCounts: { done: 0, total: 0 },
  childTasks: [],
  ...overrides,
});

const renderWithValue = (value: TaskCardContextValue, children: ReactNode) => {
  act(() => {
    root?.render(createElement(TaskCardContext.Provider, { value }, children));
  });
};

test("Draft / Priority / Due / title が描画される", () => {
  renderWithValue(
    baseValue({
      task: createTask({
        title: "ログイン修正",
        draft: true,
        priority: "High",
        due: "2026-07-01",
      }),
    }),
    createElement(TaskCardHeader),
  );
  expect(
    container?.querySelector('[data-testid="task-card-title"]')?.textContent,
  ).toBe("ログイン修正");
  expect(container?.querySelector('[data-testid="draft-badge"]')).toBeTruthy();
  expect(container?.textContent).toContain("High");
});

test.each([
  {
    label: "hasBrokenLink=true で WarningIcon",
    hasBrokenLink: true,
    hasParseError: false,
    warning: true,
    parseError: false,
  },
  {
    label: "hasParseError=true で ParseErrorIcon",
    hasBrokenLink: false,
    hasParseError: true,
    warning: false,
    parseError: true,
  },
  {
    label: "両 true で両アイコン",
    hasBrokenLink: true,
    hasParseError: true,
    warning: true,
    parseError: true,
  },
  {
    label: "両 false で警告コンテナなし",
    hasBrokenLink: false,
    hasParseError: false,
    warning: false,
    parseError: false,
  },
])("$label", ({ hasBrokenLink, hasParseError, warning, parseError }) => {
  renderWithValue(
    baseValue({ hasBrokenLink, hasParseError }),
    createElement(TaskCardHeader),
  );
  expect(!!container?.querySelector('[data-testid="warning-icon"]')).toBe(
    warning,
  );
  expect(!!container?.querySelector('[data-testid="parse-error-icon"]')).toBe(
    parseError,
  );
});

test("title が空のとき filePath がフォールバックで表示される", () => {
  renderWithValue(
    baseValue({
      task: createTask({ title: "", filePath: "tasks/my-task.md" }),
    }),
    createElement(TaskCardHeader),
  );
  expect(
    container?.querySelector('[data-testid="task-card-title"]')?.textContent,
  ).toBe("tasks/my-task.md");
});
