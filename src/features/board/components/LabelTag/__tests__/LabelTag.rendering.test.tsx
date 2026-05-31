import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { LabelRegistry } from "@/domains/label-registry";
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

test("インライン style に type 群の fg/bg/bd oklch 値が含まれる", () => {
  const { fg, bg, bd } = LabelRegistry.tokensForLabel("type:feature");
  const html = renderToStaticMarkup(
    createElement(LabelTag, { label: "type:feature" }),
  );
  expect(html).toContain(fg);
  expect(html).toContain(bg);
  expect(html).toContain(bd);
});

test("グループが異なると background の oklch 値も異なる", () => {
  const typeHtml = renderToStaticMarkup(
    createElement(LabelTag, { label: "type:x" }),
  );
  const priorityHtml = renderToStaticMarkup(
    createElement(LabelTag, { label: "priority:y" }),
  );
  const typeBg = LabelRegistry.tokensForLabel("type:x").bg;
  const priorityBg = LabelRegistry.tokensForLabel("priority:y").bg;
  expect(typeBg).not.toBe(priorityBg);
  expect(typeHtml).toContain(typeBg);
  expect(priorityHtml).toContain(priorityBg);
});

test("prefix 無しラベルは default 群の oklch 値で着色される", () => {
  const { bg } = LabelRegistry.tokensForLabel("bug");
  const html = renderToStaticMarkup(createElement(LabelTag, { label: "bug" }));
  expect(bg).toBe(LabelRegistry.PALETTE[0].bg);
  expect(html).toContain(bg);
});

test("旧 gray クラス（bg-gray-100）を含まない", () => {
  const html = renderToStaticMarkup(createElement(LabelTag, { label: "bug" }));
  expect(html).not.toContain("bg-gray-100");
});
