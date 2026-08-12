import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormFooter } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

const renderFooter = (
  overrides: Partial<Parameters<typeof TaskFormFooter>[0]> = {},
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <TaskFormFooter
        saveHint="保存先: tasks/new-task.md"
        canSubmit
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        {...overrides}
      />,
    );
  });
};

test("送信中は両操作を無効化し作成中ラベルを表示する", () => {
  renderFooter({ isSubmitting: true });
  const cancel = container?.querySelector<HTMLButtonElement>(
    '[data-testid="task-form-cancel"]',
  );
  const submit = container?.querySelector<HTMLButtonElement>(
    '[data-testid="task-form-submit"]',
  );
  expect(cancel?.disabled).toBe(true);
  expect(submit?.disabled).toBe(true);
  expect(submit?.textContent).toContain("作成中…");
});

test("有効時はcancelとsubmitイベントを通知する", () => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  renderFooter({ onCancel, onSubmit });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-testid="task-form-cancel"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-testid="task-form-submit"]')
      ?.click();
  });
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onSubmit).toHaveBeenCalledOnce();
});
