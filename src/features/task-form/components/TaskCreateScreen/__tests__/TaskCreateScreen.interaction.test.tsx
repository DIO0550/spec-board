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

const DUPLICATE = Task.fromPayload({
  id: "d-1",
  title: "重複タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/dup-task.md",
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

const setInput = (testId: string, value: string) => {
  const el = document.querySelector(`[data-testid="${testId}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const submitForm = () => {
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

test("送信成功で onClose が1回呼ばれる", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

test("onSubmit が reject すると onClose は呼ばれない", async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});

test("送信中に再送信しても onSubmit は1回のみ（二重送信ガード）", async () => {
  let resolveSubmit: (() => void) | undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      }),
  );
  render(baseProps({ onSubmit }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  act(() => {
    submitForm();
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledOnce();
  await act(async () => {
    resolveSubmit?.();
    await Promise.resolve();
  });
});

test("送信中はフィールド・送信ボタンが無効化される", async () => {
  const onSubmit = vi.fn(() => new Promise<void>(() => {}));
  render(baseProps({ onSubmit }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const submit = document.querySelector(
    '[data-testid="task-form-submit"]',
  ) as HTMLButtonElement;
  expect(title.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
});

test("既存タスクと重複するタイトルは送信されない（DUPLICATE）", () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(baseProps({ existingTasks: [DUPLICATE], onSubmit }));
  act(() => {
    setInput("task-form-title", "Dup Task");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(
    document.querySelector('[data-testid="task-form-title-error"]'),
  ).toBeTruthy();
});

test("左フォームの入力が右プレビューに追従する（ライブプレビュー）", () => {
  render(baseProps());
  act(() => {
    setInput("task-form-title", "追従タイトル");
  });
  act(() => {
    setInput("task-form-body", "本文プレビュー");
  });
  const rendered = document.querySelector('[data-testid="preview-rendered"]');
  expect(rendered?.querySelector("pre")?.textContent).toContain(
    "title: 追従タイトル",
  );
  expect(
    document.querySelector('[data-testid="markdown-content"]')?.textContent,
  ).toContain("本文プレビュー");
});
