import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import { Task } from "@/types/task";
import { TaskForm } from "..";

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
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

const PARENT_CANDIDATES: Task[] = [
  Task.fromPayload({
    id: "p-1",
    title: "親タスクA",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/parent-a.md",
  }),
];

const render = (props: Parameters<typeof TaskForm>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskForm, props));
  });
};

test("全フィールドが表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="task-form-title"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-status"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-priority"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-labels"]'),
  ).toBeTruthy();
  expect(document.querySelector('[data-testid="task-form-body"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-cancel"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-submit"]'),
  ).toBeTruthy();
});

test("parentCandidates 未指定なら親タスクフィールドは表示されない", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="parent-task-select"]'),
  ).toBeNull();
});

test("parentCandidates 指定で親タスク選択 UI が表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    parentCandidates: PARENT_CANDIDATES,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  expect(
    document.querySelector('[data-testid="parent-task-select"]'),
  ).toBeTruthy();
});

test("ファイル名フィールドが .md サフィックス・連番ヒントとともに表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const input = document.querySelector(
    '[data-testid="task-form-file-name"]',
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.parentElement?.textContent).toContain(".md");
  expect(input.closest("div")?.parentElement?.textContent).toContain(
    "連番が付きます",
  );
});

test("ファイル名エラーなし時は aria-invalid が付与されない", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const input = document.querySelector(
    '[data-testid="task-form-file-name"]',
  ) as HTMLInputElement;
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(
    document.querySelector('[data-testid="task-form-file-name-error"]'),
  ).toBeNull();
});

test("期限フィールド（date input）が表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const due = document.querySelector(
    '[data-testid="task-form-due"]',
  ) as HTMLInputElement;
  expect(due).toBeTruthy();
  expect(due.getAttribute("type")).toBe("date");
});

test("サブIssue フィールドが空行無視のヒントとともに表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const textarea = document.querySelector(
    '[data-testid="task-form-sub-issues"]',
  ) as HTMLTextAreaElement;
  expect(textarea).toBeTruthy();
  expect(textarea.closest("div")?.textContent).toContain(
    "1 行につき 1 件のサブIssue を作成します（空行は無視）",
  );
});

test("下書きチェックボックスが表示される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const checkbox = document.querySelector(
    '[data-testid="task-form-draft"]',
  ) as HTMLInputElement;
  expect(checkbox).toBeTruthy();
  expect(checkbox.getAttribute("type")).toBe("checkbox");
  expect(checkbox.checked).toBe(false);
});
