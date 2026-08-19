import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ColumnHeader } from "..";

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

/**
 * ColumnHeader を order 既定 0 で描画するテストヘルパー。
 * @param props - order 以外の ColumnHeader props（order は上書き可）
 */
function render(
  props: Omit<Parameters<typeof ColumnHeader>[0], "order"> & {
    order?: number;
  },
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ColumnHeader, { order: 0, ...props }));
  });
}

/** 件数バッジ要素を取得する。 @returns バッジ要素（無ければ null） */
function countBadge(): HTMLElement | null {
  return container?.querySelector("[data-testid='column-task-count']") ?? null;
}

test("wipLimit 未指定なら件数バッジは件数のみを表示する", async () => {
  render({ name: "Todo", taskCount: 3, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(countBadge()?.textContent).toBe("3");
  });
});

test("wipLimit 指定時は件数バッジが「件数/上限」形式になる", async () => {
  render({ name: "Todo", taskCount: 3, wipLimit: 5, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(countBadge()?.textContent).toBe("3/5");
  });
});

test("総件数が上限以内なら超過状態にならない", async () => {
  render({
    name: "Todo",
    taskCount: 2,
    totalTaskCount: 5,
    wipLimit: 5,
    onAddClick: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(countBadge()?.getAttribute("data-wip-exceeded")).toBeNull();
  });
});

test("総件数が上限を超えるとバッジが超過状態になる", async () => {
  render({
    name: "Todo",
    taskCount: 2,
    totalTaskCount: 6,
    wipLimit: 5,
    onAddClick: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(countBadge()?.getAttribute("data-wip-exceeded")).toBe("true");
    expect(countBadge()?.getAttribute("title")).toContain("WIP上限");
  });
});

test("totalTaskCount 未指定時は taskCount で超過判定する", async () => {
  render({ name: "Todo", taskCount: 6, wipLimit: 5, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(countBadge()?.getAttribute("data-wip-exceeded")).toBe("true");
  });
});

test("上限ちょうどの件数は超過にならない", async () => {
  render({ name: "Todo", taskCount: 5, wipLimit: 5, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(countBadge()?.textContent).toBe("5/5");
    expect(countBadge()?.getAttribute("data-wip-exceeded")).toBeNull();
  });
});
