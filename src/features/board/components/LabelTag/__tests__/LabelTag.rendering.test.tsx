import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { LabelTag } from "..";

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

function render(props: Parameters<typeof LabelTag>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LabelTag, props));
  });
}

test("ラベル名が表示される", async () => {
  render({ label: "bug" });
  await vi.waitFor(() => {
    const tag = container?.querySelector("span");
    expect(tag).toBeTruthy();
    expect(tag?.textContent).toBe("bug");
  });
});

test("ラベルタグにスタイルが適用される", async () => {
  render({ label: "frontend" });
  await vi.waitFor(() => {
    const tag = container?.querySelector("span");
    expect(tag).toBeTruthy();
    expect(tag?.className).toContain("bg-gray-100");
  });
});
