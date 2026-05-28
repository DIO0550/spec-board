import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { BrokenParentRow } from "@/features/detail/components/BrokenParentRow";

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
 * BrokenParentRow をレンダリングするヘルパー。
 * @param props - props
 */
const render = (props: Parameters<typeof BrokenParentRow>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(BrokenParentRow, props));
  });
};

test("parentFilePath が取消線スタイルで描画される", () => {
  render({ parentFilePath: "tasks/missing.md" });
  const row = document.querySelector('[data-testid="broken-parent-row"]');
  expect(row?.textContent).toContain("tasks/missing.md");
  const struck = row?.querySelector(".line-through");
  expect(struck?.textContent).toBe("tasks/missing.md");
});

test("WarningIcon が描画される", () => {
  render({ parentFilePath: "tasks/missing.md" });
  const row = document.querySelector('[data-testid="broken-parent-row"]');
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
});

test("『リンク切れ』テキストが含まれる", () => {
  render({ parentFilePath: "tasks/missing.md" });
  const row = document.querySelector('[data-testid="broken-parent-row"]');
  expect(row?.textContent).toContain("リンク切れ");
});
