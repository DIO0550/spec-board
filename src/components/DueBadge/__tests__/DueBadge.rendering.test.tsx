import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { DueBadge } from "..";

const TODAY = "2026-06-01";

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

function render(props: Parameters<typeof DueBadge>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DueBadge, props));
  });
}

test("未来日は「あと X 日」を非強調バッジで表示する", async () => {
  render({ due: "2026-06-10", today: TODAY });
  await vi.waitFor(() => {
    const badge = container?.querySelector("span");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("あと 9 日");
    expect(badge?.className).toContain("bg-surface-muted");
  });
});

test("過去日は「X 日超過（期限切れ）」を赤系で強調表示する", async () => {
  render({ due: "2026-05-30", today: TODAY });
  await vi.waitFor(() => {
    const badge = container?.querySelector("span");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("2 日超過（期限切れ）");
    expect(badge?.className).toContain("bg-red-100");
  });
});

test("期限当日は「今日」を表示する", async () => {
  render({ due: TODAY, today: TODAY });
  await vi.waitFor(() => {
    const badge = container?.querySelector("span");
    expect(badge?.textContent).toBe("今日");
  });
});

test("due 未設定でバッジ非表示", async () => {
  render({ due: undefined, today: TODAY });
  await vi.waitFor(() => {
    expect(container?.querySelector("span")).toBeNull();
  });
});

test("不正な due でバッジ非表示", async () => {
  render({ due: "2026/6/30", today: TODAY });
  await vi.waitFor(() => {
    expect(container?.querySelector("span")).toBeNull();
  });
});
