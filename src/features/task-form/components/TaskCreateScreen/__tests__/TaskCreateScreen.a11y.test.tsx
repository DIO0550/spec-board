import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
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

const COLUMNS: Column[] = [{ name: "Todo", order: 0 }];

const baseProps = (
  overrides: Partial<Parameters<typeof TaskCreateScreen>[0]> = {},
): Parameters<typeof TaskCreateScreen>[0] => ({
  columns: COLUMNS,
  initialStatus: "Todo",
  existingTasks: [],
  watchedFileCount: 0,
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

const setTitle = (value: string) => {
  const el = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
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

const pressEscape = () => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
};

test("ランドマーク section が aria-label と tabindex=-1 を持つ", () => {
  render(baseProps());
  const section = document.querySelector(
    'section[aria-label="タスク作成"]',
  ) as HTMLElement;
  expect(section).toBeTruthy();
  expect(section.getAttribute("tabindex")).toBe("-1");
});

test("mount 時にランドマーク section へフォーカスが移る", () => {
  render(baseProps());
  const section = document.querySelector('section[aria-label="タスク作成"]');
  expect(document.activeElement).toBe(section);
});

test("IME 変換中（isComposing）の Esc では onClose が呼ばれない", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", isComposing: true }),
    );
  });
  expect(onClose).not.toHaveBeenCalled();
});

test("Esc キーで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  pressEscape();
  expect(onClose).toHaveBeenCalledOnce();
});

test("送信中は Esc が無効（onClose 非発火）", async () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn(() => new Promise<void>(() => {}));
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await act(async () => {
    await Promise.resolve();
  });
  pressEscape();
  expect(onClose).not.toHaveBeenCalled();
});

test("キャンセルボタン click で onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render(baseProps({ onClose }));
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  act(() => {
    cancel.click();
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test("ステータス/優先度が listbox 開閉ボタン（aria-haspopup=listbox）として描画され、それぞれラベルと関連付く", () => {
  render(baseProps());
  const status = document.querySelector('[data-testid="task-form-status"]');
  const priority = document.querySelector('[data-testid="task-form-priority"]');
  expect(status?.getAttribute("aria-haspopup")).toBe("listbox");
  expect(priority?.getAttribute("aria-haspopup")).toBe("listbox");
  // aria-labelledby は「ラベル id + 選択値 id」の 2 トークン。先頭がラベル要素。
  const statusLabelId = status?.getAttribute("aria-labelledby")?.split(" ")[0];
  const priorityLabelId = priority
    ?.getAttribute("aria-labelledby")
    ?.split(" ")[0];
  expect(document.getElementById(statusLabelId ?? "")?.textContent).toContain(
    "ステータス",
  );
  expect(document.getElementById(priorityLabelId ?? "")?.textContent).toContain(
    "優先度",
  );
});

test("ラベルの popover trigger が aria-haspopup / aria-expanded を持つ", () => {
  render(baseProps());
  const trigger = document.querySelector(
    '[data-testid="task-form-labels"]',
  ) as HTMLButtonElement;
  expect(trigger.getAttribute("aria-haspopup")).toBe("true");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("Markdown ツールバーが role=toolbar と各ボタンの aria-label を持つ", () => {
  render(baseProps());
  const toolbar = document.querySelector('[role="toolbar"]');
  expect(toolbar?.getAttribute("aria-label")).toBe("Markdown 編集");
  const buttons = Array.from(toolbar?.querySelectorAll("button") ?? []);
  expect(buttons.length).toBe(9);
  expect(buttons.every((b) => b.getAttribute("aria-label"))).toBeTruthy();
});

test("入力ありの Esc で表示される破棄確認が alertdialog + aria-modal を持つ", () => {
  render(baseProps());
  act(() => {
    setTitle("入力中");
  });
  pressEscape();
  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog?.getAttribute("aria-modal")).toBe("true");
});

test("パスプレビュー領域に aria-live=polite が付与される", () => {
  render(baseProps());
  const form = document.querySelector('[data-testid="task-form"]');
  const live = form?.querySelector('[aria-live="polite"]');
  expect(live).toBeTruthy();
  // 未入力時は pending の案内文がライブリージョン内に表示される。
  expect(live?.textContent).toContain(
    "タイトルまたはファイル名を入力すると保存先パスを表示します",
  );
});
