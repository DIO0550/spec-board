import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { MarkdownContent } from "..";

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

const render = (body: string) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(MarkdownContent, { body }));
  });
};

test("heading とタスクリストを含む本文が markdown-content 内にブロック描画される", () => {
  render("# 見出し\n\n- [ ] やること\n- [x] 完了");

  const content = container?.querySelector('[data-testid="markdown-content"]');
  expect(content).not.toBeNull();
  expect(content?.querySelector("h1")?.textContent).toBe("見出し");
  expect(content?.querySelectorAll('input[type="checkbox"]').length).toBe(2);
});

test("空本文では何も描画せず null を返す", () => {
  render("");

  expect(
    container?.querySelector('[data-testid="markdown-content"]'),
  ).toBeNull();
  expect(container?.textContent).toBe("");
});

test("タスクリストの checked 状態がチェックボックスに反映される", () => {
  render("- [x] 完了\n- [ ] 未完了");

  const checkboxes = container?.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(checkboxes?.[0].checked).toBe(true);
  expect(checkboxes?.[1].checked).toBe(false);
});

test("純表示のためチェックボックスは操作不可（disabled）", () => {
  render("- [ ] やること");

  const checkbox = container?.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(checkbox?.disabled).toBe(true);
});
