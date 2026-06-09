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
