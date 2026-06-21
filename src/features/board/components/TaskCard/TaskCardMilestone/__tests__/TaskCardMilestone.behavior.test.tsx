import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { MilestoneDefinition } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import {
  type MilestonesByName,
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardMilestone } from "..";

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
    title: "テスト",
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

test("milestone='v1' + milestonesByName 解決ありで definition 付きバッジが出る", () => {
  const map: MilestonesByName = new Map<string, MilestoneDefinition>([
    ["v1", { name: "v1", title: "v1 リリース", due: "2026-08-31" }],
  ]);
  renderWithValue(
    baseValue({
      task: createTask({ milestone: "v1" }),
      milestonesByName: map,
    }),
    createElement(TaskCardMilestone),
  );
  const badge = container?.querySelector('[data-testid="milestone-badge"]');
  expect(badge?.textContent).toContain("v1 リリース");
  expect(badge?.textContent).toContain("2026-08-31");
});

test("milestone='v9' + milestonesByName 未指定で name のみ表示", () => {
  renderWithValue(
    baseValue({
      task: createTask({ milestone: "v9" }),
      milestonesByName: undefined,
    }),
    createElement(TaskCardMilestone),
  );
  const badge = container?.querySelector('[data-testid="milestone-badge"]');
  expect(badge?.textContent).toContain("v9");
});

test("milestone 未設定で null（バッジ描画なし）", () => {
  renderWithValue(
    baseValue({ task: createTask({ milestone: undefined }) }),
    createElement(TaskCardMilestone),
  );
  expect(
    container?.querySelector('[data-testid="milestone-badge"]'),
  ).toBeNull();
});
