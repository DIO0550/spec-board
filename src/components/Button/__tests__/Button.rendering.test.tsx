import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "..";

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

function render(props: Parameters<typeof Button>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Button, props));
  });
}

test("primary variant のクラスが描画される", async () => {
  render({ variant: "primary", children: "送信" });
  await vi.waitFor(() => {
    const btn = container?.querySelector("button");
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toBe("送信");
    expect(btn?.className).toContain("bg-blue-600");
    expect(btn?.className).toContain("text-white");
    expect(btn?.className).toContain("px-4");
    expect(btn?.className).toContain("py-2");
    expect(btn?.className).toContain("rounded");
  });
});

test("secondary variant のクラスが描画される", async () => {
  render({ variant: "secondary", children: "キャンセル" });
  await vi.waitFor(() => {
    const btn = container?.querySelector("button");
    expect(btn?.className).toContain("text-gray-700");
    expect(btn?.className).toContain("hover:bg-gray-100");
    expect(btn?.className).not.toContain("bg-blue-600");
  });
});

test('type を指定しなければ type="button" が描画される', async () => {
  render({ variant: "primary", children: "x" });
  await vi.waitFor(() => {
    const btn = container?.querySelector("button");
    expect(btn?.getAttribute("type")).toBe("button");
  });
});

test('type="submit" が指定できる', async () => {
  render({ variant: "primary", type: "submit", children: "送信" });
  await vi.waitFor(() => {
    const btn = container?.querySelector("button");
    expect(btn?.getAttribute("type")).toBe("submit");
  });
});

test("任意の HTML 属性（aria-label, data-testid）が透過される", async () => {
  render({
    variant: "primary",
    "aria-label": "send",
    "data-testid": "my-btn",
    children: "x",
  });
  await vi.waitFor(() => {
    const btn = container?.querySelector("button");
    expect(btn?.getAttribute("aria-label")).toBe("send");
    expect(btn?.getAttribute("data-testid")).toBe("my-btn");
  });
});
