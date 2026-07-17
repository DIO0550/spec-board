import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task } from "@/domains/task";
import type { CreateTaskSubmitOutcome } from "@/features/task-form/hooks/useTaskCreate";
import { unregisterToastSink } from "@/lib/tauri";
import { ToastProvider } from "@/providers/ToastProvider";
import type { Column } from "@/types/column";
import { Result } from "@/utils/result";
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
  unregisterToastSink();
});

const STUB_PARENT_OUTCOME: CreateTaskSubmitOutcome = {
  parent: Task.fromPayload({
    id: "p-stub",
    title: "親",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/stub-parent.md",
  }),
  failedSubIssues: [],
};

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
  watchedFileCount: 0,
  onSubmit: vi.fn().mockResolvedValue(Result.ok(STUB_PARENT_OUTCOME)),
  onClose: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof TaskCreateScreen>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        ToastProvider,
        null,
        createElement(TaskCreateScreen, props),
      ),
    );
  });
};

test("左フォームと右プレビューの2ペインが chrome（topbar/subbar/footer）付きで描画される", () => {
  render(baseProps());
  expect(
    document.querySelector('section[aria-label="タスク作成"]'),
  ).toBeTruthy();
  expect(document.querySelector('[data-testid="task-form"]')).toBeTruthy();
  expect(document.querySelector('aside[aria-label="プレビュー"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-topbar-sync"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-subbar-back"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-save-meta"]'),
  ).toBeTruthy();
});

test("同期バッジに watchedFileCount が「監視 N files」として表示される", () => {
  render(baseProps({ watchedFileCount: 3 }));
  expect(
    document.querySelector('[data-testid="task-topbar-sync"]')?.textContent,
  ).toContain("監視 3 files");
});

test("title 未入力では footer に「タイトルを入力してください」が出て作成ボタンが disabled", () => {
  render(baseProps());
  expect(
    document.querySelector('[data-testid="task-form-save-meta"]')?.textContent,
  ).toContain("タイトルを入力してください");
  const submit = document.querySelector(
    '[data-testid="task-form-submit"]',
  ) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
});

test("title 入力後は footer の save-meta が保存先へ変わり作成ボタンが活性化する", () => {
  render(baseProps({ projectPath: "/tmp/project" }));
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(title, "My Task");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    document.querySelector('[data-testid="task-form-save-meta"]')?.textContent,
  ).toContain("保存先:");
  const submit = document.querySelector(
    '[data-testid="task-form-submit"]',
  ) as HTMLButtonElement;
  expect(submit.disabled).toBe(false);
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

test("initialStatus が status フィールド（select trigger）に反映される", () => {
  render(baseProps({ initialStatus: "Done" }));
  const trigger = document.querySelector('[data-testid="status-field"]');
  expect(trigger?.textContent).toContain("Done");
});

test("projectPath が TaskForm のパスプレビューへ pass-through される", () => {
  render(baseProps({ projectPath: "/tmp/project" }));
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(title, "My Task");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    document.querySelector('[data-testid="task-form-path-preview"]')
      ?.textContent,
  ).toBe("/tmp/project/tasks/my-task.md");
});
