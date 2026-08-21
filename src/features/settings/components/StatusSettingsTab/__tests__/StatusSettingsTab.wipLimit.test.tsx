import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { StatusSettingsTab } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** @param props - StatusSettingsTab props */
const renderTab = (props: Parameters<typeof StatusSettingsTab>[0] = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(StatusSettingsTab, props)));
};

/**
 * input へ React 管理下の値変更イベントを発火する。
 * @param input - 対象 input 要素
 * @param value - 設定する値
 */
const setInputValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

/** @param label - accessible label @returns 一致 input */
const inputByLabel = (label: string): HTMLInputElement | undefined =>
  Array.from(container?.querySelectorAll<HTMLInputElement>("input") ?? []).find(
    (input) => input.getAttribute("aria-label") === label,
  );

/** @param label - accessible label または button text @returns 一致 button */
const buttonByLabel = (label: string): HTMLButtonElement | undefined =>
  Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent === label,
  );

test("initialColumns の wipLimit が WIP 上限入力に表示される", () => {
  renderTab({
    initialColumns: [
      { id: "todo", name: "Todo", taskCount: 1, color: "#1a2b3c", wipLimit: 4 },
      { id: "done", name: "Done", taskCount: 0, color: "#1a2b3c" },
    ],
    initialDoneColumn: "Done",
  });
  expect(inputByLabel("Todo の WIP 上限")?.value).toBe("4");
  expect(inputByLabel("Done の WIP 上限")?.value).toBe("");
});

test("WIP 上限を入力して保存すると wipLimit が onSave 値に含まれる", () => {
  const onSave = vi.fn();
  renderTab({ onSave });
  const input = inputByLabel("Todo の WIP 上限");
  expect(input).toBeDefined();
  act(() => setInputValue(input as HTMLInputElement, "3"));
  act(() => buttonByLabel("変更を保存")?.click());
  const value = onSave.mock.calls[0]?.[0];
  const todo = value.columns.find(
    (column: { name: string }) => column.name === "Todo",
  );
  expect(todo?.wipLimit).toBe(3);
});

test("WIP 上限を空にして保存すると wipLimit は undefined になる", () => {
  const onSave = vi.fn();
  renderTab({
    initialColumns: [
      { id: "todo", name: "Todo", taskCount: 1, color: "#1a2b3c", wipLimit: 4 },
    ],
    initialDoneColumn: "Todo",
    onSave,
  });
  const input = inputByLabel("Todo の WIP 上限");
  act(() => setInputValue(input as HTMLInputElement, ""));
  act(() => buttonByLabel("変更を保存")?.click());
  const value = onSave.mock.calls[0]?.[0];
  expect(value.columns[0]?.wipLimit).toBeUndefined();
});

test("非整数の WIP 上限入力は保存時に undefined へ倒れる", () => {
  const onSave = vi.fn();
  renderTab({ onSave });
  const input = inputByLabel("Todo の WIP 上限");
  act(() => setInputValue(input as HTMLInputElement, "2.5"));
  act(() => buttonByLabel("変更を保存")?.click());
  const value = onSave.mock.calls[0]?.[0];
  const todo = value.columns.find(
    (column: { name: string }) => column.name === "Todo",
  );
  expect(todo?.wipLimit).toBeUndefined();
});

test("0 以下の WIP 上限入力は保存時に undefined へ倒れる", () => {
  const onSave = vi.fn();
  renderTab({ onSave });
  const input = inputByLabel("Todo の WIP 上限");
  act(() => setInputValue(input as HTMLInputElement, "0"));
  act(() => buttonByLabel("変更を保存")?.click());
  const value = onSave.mock.calls[0]?.[0];
  const todo = value.columns.find(
    (column: { name: string }) => column.name === "Todo",
  );
  expect(todo?.wipLimit).toBeUndefined();
});
