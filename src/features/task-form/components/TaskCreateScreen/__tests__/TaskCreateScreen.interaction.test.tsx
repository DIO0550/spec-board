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

test("既存タスクと重複するタイトルでも送信される（重複は BE の連番付与で回避）", () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(baseProps({ existingTasks: [DUPLICATE], onSubmit }));
  act(() => {
    setInput("task-form-title", "Dup Task");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(
    document.querySelector('[data-testid="task-form-title-error"]'),
  ).toBeNull();
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

const dispatchDocumentKey = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  });
};

const confirmDialog = () =>
  document.querySelector('[data-testid="confirm-dialog"]');

test.each([
  ["metaKey（mac の ⌘+Enter）", { metaKey: true }],
  ["ctrlKey（Windows/Linux の Ctrl+Enter）", { ctrlKey: true }],
])("%s + Enter で保存（バリデーション経由で onSubmit 到達）", async (_label, init) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(baseProps({ onSubmit }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  dispatchDocumentKey("Enter", init);
  await flush();
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit.mock.calls[0][0].title).toBe("新タスク");
});

test("タイトル未入力の ⌘+Enter はバリデーションで止まり onSubmit に到達しない", () => {
  const onSubmit = vi.fn();
  render(baseProps({ onSubmit }));
  dispatchDocumentKey("Enter", { metaKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(
    document.querySelector('[data-testid="task-form-title-error"]'),
  ).toBeTruthy();
});

test("requestSubmit 未対応環境では submit イベント dispatch にフォールバックして onSubmit に到達する", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(baseProps({ onSubmit }));
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  Object.defineProperty(form, "requestSubmit", { value: undefined });
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  dispatchDocumentKey("Enter", { metaKey: true });
  await flush();
  expect(onSubmit).toHaveBeenCalledOnce();
});

test("未入力で Esc すると破棄確認を出さず即 onClose する", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  dispatchDocumentKey("Escape");
  expect(confirmDialog()).toBeNull();
  expect(onClose).toHaveBeenCalledOnce();
});

test("入力ありで Esc すると破棄確認ダイアログが表示され onClose は呼ばれない", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  act(() => {
    setInput("task-form-title", "途中入力");
  });
  dispatchDocumentKey("Escape");
  expect(confirmDialog()).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test("破棄確認ダイアログの「破棄する」で onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  act(() => {
    setInput("task-form-title", "途中入力");
  });
  dispatchDocumentKey("Escape");
  const confirm = document.querySelector(
    '[data-testid="confirm-confirm-button"]',
  ) as HTMLButtonElement;
  act(() => {
    confirm.click();
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test("破棄確認ダイアログの「キャンセル」でダイアログだけ閉じ、画面と入力が維持される", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  act(() => {
    setInput("task-form-title", "途中入力");
  });
  dispatchDocumentKey("Escape");
  const cancel = document.querySelector(
    '[data-testid="confirm-cancel-button"]',
  ) as HTMLButtonElement;
  act(() => {
    cancel.click();
  });
  expect(confirmDialog()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  expect(title.value).toBe("途中入力");
});

test("入力ありでキャンセルボタンを押すと Esc と同じ破棄確認フローになる", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  act(() => {
    setInput("task-form-title", "途中入力");
  });
  const cancelButton = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  act(() => {
    cancelButton.click();
  });
  expect(confirmDialog()).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test("IME 変換中（isComposing）の ⌘+Enter では保存が発動しない", () => {
  const onSubmit = vi.fn();
  render(baseProps({ onSubmit }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  dispatchDocumentKey("Enter", { metaKey: true, isComposing: true });
  expect(onSubmit).not.toHaveBeenCalled();
});

test("送信中の ⌘+Enter / Esc は無視される（二重送信・クローズなし）", async () => {
  const onSubmit = vi.fn(() => new Promise<void>(() => {}));
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setInput("task-form-title", "新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  dispatchDocumentKey("Enter", { metaKey: true });
  dispatchDocumentKey("Escape");
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(confirmDialog()).toBeNull();
});

test("ダイアログ表示中の Esc 1 回ではダイアログだけ閉じ onClose は呼ばれない", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  act(() => {
    setInput("task-form-title", "途中入力");
  });
  dispatchDocumentKey("Escape");
  expect(confirmDialog()).toBeTruthy();
  dispatchDocumentKey("Escape");
  expect(confirmDialog()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test("ダイアログ表示中の ⌘+Enter では保存が発動せずダイアログも維持される", () => {
  const onSubmit = vi.fn();
  render(baseProps({ onSubmit }));
  act(() => {
    setInput("task-form-title", "途中入力");
  });
  dispatchDocumentKey("Escape");
  dispatchDocumentKey("Enter", { metaKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(confirmDialog()).toBeTruthy();
});
