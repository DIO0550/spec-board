import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import { Task } from "@/types/task";
import { TaskCreateScreen } from "..";

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

const COLUMNS: Column[] = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

const PARENT = Task.fromPayload({
  id: "p-1",
  title: "親タスクA",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/parent-a.md",
});

const baseProps = (
  overrides: Partial<Parameters<typeof TaskCreateScreen>[0]> = {},
): Parameters<typeof TaskCreateScreen>[0] => ({
  columns: COLUMNS,
  initialStatus: "Todo",
  existingTasks: [],
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof TaskCreateScreen>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskCreateScreen, props));
  });
};

test("左フォームと右プレビューの2ペインが描画される", () => {
  render(baseProps());
  expect(
    document.querySelector('section[aria-label="タスク作成"]'),
  ).toBeTruthy();
  expect(document.querySelector('[data-testid="task-form"]')).toBeTruthy();
  expect(document.querySelector('aside[aria-label="プレビュー"]')).toBeTruthy();
});

test("parentCandidates 未指定で親フィールドが描画されない", () => {
  render(baseProps({ parentCandidates: undefined }));
  expect(
    document.querySelector('[data-testid="parent-task-select"]'),
  ).toBeNull();
});

test("parentReadOnly=true で親フィールドが readOnly（解除ボタンなし）", () => {
  render(
    baseProps({
      parentCandidates: [PARENT],
      initialParent: "tasks/parent-a.md",
      parentReadOnly: true,
    }),
  );
  expect(
    document.querySelector('[data-testid="parent-task-selected"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="parent-task-clear"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-testid="parent-task-input"]'),
  ).toBeNull();
});

test("initialStatus が status フィールドに反映される", () => {
  render(baseProps({ initialStatus: "Done" }));
  const status = document.querySelector(
    '[data-testid="task-form-status"]',
  ) as HTMLSelectElement;
  expect(status.value).toBe("Done");
});
