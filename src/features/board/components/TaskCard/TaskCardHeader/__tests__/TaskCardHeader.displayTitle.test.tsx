import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Task } from "@/domains/task";
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

const makeContextValue = (
  overrides: Partial<TaskCardContextValue> = {},
): TaskCardContextValue => ({
  task: Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
  }),
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

const titleText = (): string | null | undefined =>
  container?.querySelector('[data-testid="task-card-title"]')?.textContent;

test("title 非空はそのまま表示される", () => {
  renderWithValue(
    makeContextValue({
      task: Task.fromPayload({
        id: "t1",
        title: "ログイン修正",
        status: "Todo",
        labels: [],
        links: [],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "tasks/login-fix.md",
      }),
    }),
    createElement(TaskCardHeader),
  );
  expect(titleText()).toBe("ログイン修正");
});

test("title 空文字は filePath basename の .md 除去にフォールバック", () => {
  renderWithValue(
    makeContextValue({
      task: Task.fromPayload({
        id: "t1",
        title: "",
        status: "Todo",
        labels: [],
        links: [],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "tasks/login-fix.md",
      }),
    }),
    createElement(TaskCardHeader),
  );
  expect(titleText()).toBe("login-fix");
});

test("title 空 + filePath 空は id にフォールバック", () => {
  renderWithValue(
    makeContextValue({
      task: Task.fromPayload({
        id: "task-42",
        title: "",
        status: "Todo",
        labels: [],
        links: [],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "",
      }),
    }),
    createElement(TaskCardHeader),
  );
  expect(titleText()).toBe("task-42");
});
