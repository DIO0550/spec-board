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

/** @param label - accessible labelまたはbutton text @returns 一致button */
const buttonByLabel = (label: string): HTMLButtonElement | undefined =>
  Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent === label,
  );

test("カラムを並び替え、完了カラムを選択して保存できる", () => {
  const onSave = vi.fn();
  renderTab({ onSave });
  act(() => buttonByLabel("Todo を上へ")?.click());
  const radio = container?.querySelector<HTMLInputElement>(
    '[aria-label="Todo を完了カラムにする"]',
  );
  act(() => radio?.click());
  act(() => buttonByLabel("変更を保存")?.click());
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ doneColumn: "Todo" }),
  );
});

test("タスクが残るカラムは削除できず、空カラムは削除できる", () => {
  renderTab();
  expect(buttonByLabel("Todo を削除")?.disabled).toBe(true);
  const input = container?.querySelector<HTMLInputElement>(
    '[aria-label="新しいカラム名"]',
  );
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "Blocked");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => buttonByLabel("カラムを追加")?.click());
  act(() => buttonByLabel("Blocked を削除")?.click());
  expect(buttonByLabel("Blocked を削除")).toBeUndefined();
});
