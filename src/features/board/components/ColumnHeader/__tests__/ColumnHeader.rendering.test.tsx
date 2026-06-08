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

test("ステータス名が表示される", async () => {
  render({ name: "Todo", taskCount: 3, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Todo");
  });
});

test("タスク件数が表示される", async () => {
  render({ name: "Todo", taskCount: 5, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("5");
  });
});

test("「+ 追加」ボタンが表示される", async () => {
  render({ name: "Todo", taskCount: 0, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    const btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "+ 追加",
    );
    expect(btn).toBeDefined();
  });
});

test("「+ 追加」ボタンクリックでコールバックが呼ばれる", async () => {
  const onAddClick = vi.fn();
  render({ name: "Todo", taskCount: 0, onAddClick });
  let btn: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "+ 追加",
    );
    expect(btn).toBeDefined();
  });
  btn?.click();
  expect(onAddClick).toHaveBeenCalledTimes(1);
});

test("color 指定時は上ボーダーが指定色になる", async () => {
  render({
    name: "Todo",
    taskCount: 0,
    order: 0,
    color: "#1a2b3c",
    onAddClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const header = container?.querySelector<HTMLElement>(
      "[data-testid='column-header']",
    );
    // happy-dom / 実ブラウザで hex が rgb へ正規化される場合があるため両方を許容する。
    const border = header?.style.borderTopColor ?? "";
    expect(["#1a2b3c", "rgb(26, 43, 60)"]).toContain(border);
  });
});

test("color 大文字は小文字化して上ボーダーに適用される", async () => {
  render({
    name: "Todo",
    taskCount: 0,
    order: 0,
    color: "#1A2B3C",
    onAddClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const header = container?.querySelector<HTMLElement>(
      "[data-testid='column-header']",
    );
    // happy-dom / 実ブラウザで hex が rgb へ正規化される場合があるため両方を許容する。
    const border = header?.style.borderTopColor ?? "";
    expect(["#1a2b3c", "rgb(26, 43, 60)"]).toContain(border);
  });
});

test("color 未指定時はフォールバックトークンの上ボーダーになる", async () => {
  render({ name: "Todo", taskCount: 0, order: 0, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    const header = container?.querySelector("[data-testid='column-header']");
    expect(header?.getAttribute("style")).toContain(
      "var(--color-column-accent-",
    );
  });
});

test("不正な color はフォールバックトークンの上ボーダーになる", async () => {
  render({
    name: "Todo",
    taskCount: 0,
    order: 1,
    color: "red",
    onAddClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const header = container?.querySelector("[data-testid='column-header']");
    expect(header?.getAttribute("style")).toContain(
      "var(--color-column-accent-",
    );
  });
});
