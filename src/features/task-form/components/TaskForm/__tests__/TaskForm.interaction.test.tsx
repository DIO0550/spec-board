import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
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
  {
    id: "p-1",
    title: "親タスクA",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/parent-a.md",
  },
];

const render = (props: Parameters<typeof TaskForm>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskForm, props));
  });
};

const changeInputValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const submitForm = () => {
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

test("タイトル未入力で submit すると onSubmit は呼ばれず、エラーが表示される（結合）", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).not.toHaveBeenCalled();
  const error = document.querySelector('[data-testid="task-form-title-error"]');
  expect(error).toBeTruthy();
  expect(error?.textContent).toContain("タイトル");
});

test("タイトル入力して送信すると onSubmit が正規化値で呼ばれる（priority=undefined 含む）", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "新しいタスク");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit.mock.calls[0][0]).toEqual({
    title: "新しいタスク",
    status: "Todo",
    priority: undefined,
    labels: [],
    parent: undefined,
    body: "",
  });
});

test("ラベル入力中に submit すると未コミット文字が送信値に含まれる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "T");
  });
  act(() => {
    changeInputValue(labelInput, "pending");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].labels).toEqual(["pending"]);
  // finalizeLabels は UI 整合のため commit を dispatch する
  expect(labelInput.value).toBe("");
});

test("initialParent 指定で送信値に parent が含まれる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    parentCandidates: PARENT_CANDIDATES,
    initialParent: "tasks/parent-a.md",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "子タスク");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].parent).toBe("tasks/parent-a.md");
});

test("parentCandidates 指定 + initialParent 未指定で送信すると parent は undefined", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    parentCandidates: PARENT_CANDIDATES,
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "T");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].parent).toBeUndefined();
});

test("isSubmitting=true で代表的な入力欄・送信ボタンが一括で無効化される（結合）", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    isSubmitting: true,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const status = document.querySelector(
    '[data-testid="task-form-status"]',
  ) as HTMLSelectElement;
  const submit = document.querySelector(
    '[data-testid="task-form-submit"]',
  ) as HTMLButtonElement;
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  const body = document.querySelector(
    '[data-testid="task-form-body"]',
  ) as HTMLTextAreaElement;
  expect(title.disabled).toBe(true);
  expect(status.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
  expect(cancel.disabled).toBe(true);
  expect(labelInput.disabled).toBe(true);
  expect(body.disabled).toBe(true);
});

test("キャンセルボタン click で親の onCancel が呼ばれる（結合）", () => {
  const onCancel = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel,
  });
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  act(() => {
    cancel.click();
  });
  expect(onCancel).toHaveBeenCalledTimes(1);
});
