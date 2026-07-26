import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardLabels } from "..";

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
  childRows: [],
  ...overrides,
});

const renderWithValue = (value: TaskCardContextValue, children: ReactNode) => {
  act(() => {
    root?.render(createElement(TaskCardContext.Provider, { value }, children));
  });
};

test("labels=['bug'] で LabelTag が 1 件描画される", () => {
  renderWithValue(
    baseValue({ task: createTask({ labels: ["bug"] }) }),
    createElement(TaskCardLabels),
  );
  const tags = container?.querySelectorAll('[data-testid="label-tag"]');
  expect(tags?.length).toBe(1);
  expect(tags?.[0]?.textContent).toBe("bug");
});

test("labels=['bug','urgent','frontend'] で 3 件が順序維持で描画される", () => {
  renderWithValue(
    baseValue({
      task: createTask({ labels: ["bug", "urgent", "frontend"] }),
    }),
    createElement(TaskCardLabels),
  );
  const tags = container?.querySelectorAll('[data-testid="label-tag"]');
  expect(tags?.length).toBe(3);
  expect(tags?.[0]?.textContent).toBe("bug");
  expect(tags?.[1]?.textContent).toBe("urgent");
  expect(tags?.[2]?.textContent).toBe("frontend");
});

test("labels=[] で null（タグ領域なし）", () => {
  renderWithValue(
    baseValue({ task: createTask({ labels: [] }) }),
    createElement(TaskCardLabels),
  );
  expect(container?.querySelector('[data-testid="label-tag"]')).toBeNull();
  expect(container?.querySelector(".flex-wrap")).toBeNull();
});
