import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { MarkdownToolbar } from "..";

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

const render = (props: Parameters<typeof MarkdownToolbar>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(MarkdownToolbar, props));
  });
};

test("role=toolbar 配下に 5 ボタンが aria-label 付きで描画される", () => {
  render({ onApply: vi.fn(), disabled: false });
  const toolbar = document.querySelector(
    "[data-testid='task-form-md-toolbar'][role='toolbar']",
  );
  expect(toolbar?.getAttribute("aria-label")).toBe("Markdown 編集");
  const labels = Array.from(toolbar?.querySelectorAll("button") ?? []).map(
    (b) => b.getAttribute("aria-label"),
  );
  expect(labels).toEqual([
    "見出し",
    "太字",
    "斜体",
    "箇条書きリスト",
    "タスクリスト",
  ]);
});

test.each([
  ["heading"],
  ["bold"],
  ["italic"],
  ["bulletList"],
  ["taskList"],
] as const)("%s ボタンのクリックで onApply が 1 回呼ばれる", (kind) => {
  const onApply = vi.fn();
  render({ onApply, disabled: false });
  const button = document.querySelector(
    `[data-testid='task-form-md-toolbar-${kind}']`,
  ) as HTMLButtonElement;
  act(() => {
    button.click();
  });
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(kind);
});

test("disabled=true で全ボタンが無効化され onApply が呼ばれない", () => {
  const onApply = vi.fn();
  render({ onApply, disabled: true });
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "[data-testid='task-form-md-toolbar'] button",
    ),
  );
  expect(buttons.every((b) => b.disabled)).toBe(true);
  act(() => {
    buttons[0]?.click();
  });
  expect(onApply).not.toHaveBeenCalled();
});

test("ボタンの mousedown は preventDefault され textarea のフォーカスを奪わない", () => {
  render({ onApply: vi.fn(), disabled: false });
  const button = document.querySelector(
    "[data-testid='task-form-md-toolbar-bold']",
  ) as HTMLButtonElement;
  const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  act(() => {
    button.dispatchEvent(ev);
  });
  expect(ev.defaultPrevented).toBe(true);
});
