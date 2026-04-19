import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/task";
import { StatusSelect } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

/** テスト用カラム一覧 */
const testColumns: Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * StatusSelect をレンダリングするヘルパー
 * @param props - StatusSelect に渡す props
 */
function render(props: Parameters<typeof StatusSelect>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(StatusSelect, props));
  });
}

test("現在のステータスが選択状態で表示される", () => {
  render({ value: "In Progress", columns: testColumns, onChange: vi.fn() });
  const select = document.querySelector(
    '[data-testid="status-select"]',
  ) as HTMLSelectElement;
  expect(select.value).toBe("In Progress");
});

test("全カラムが選択肢として表示される", () => {
  render({ value: "Todo", columns: testColumns, onChange: vi.fn() });
  const select = document.querySelector(
    '[data-testid="status-select"]',
  ) as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.value);
  expect(options).toEqual(["Todo", "In Progress", "Done"]);
});

test("ステータス変更でonChangeが呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "Todo", columns: testColumns, onChange });
  const select = document.querySelector(
    '[data-testid="status-select"]',
  ) as HTMLSelectElement;
  act(() => {
    select.value = "Done";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("Done");
});
