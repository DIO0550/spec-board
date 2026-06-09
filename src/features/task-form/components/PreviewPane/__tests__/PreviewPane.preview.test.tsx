import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { PreviewPane } from "..";

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

type Values = Parameters<typeof PreviewPane>[0]["values"];

const baseValues: Values = {
  title: "タスク",
  status: "Todo",
  labels: [],
  links: [],
  body: "",
};

const render = (values: Values) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PreviewPane, { values }));
  });
};

const clickRawTab = () => {
  const tabs = container?.querySelectorAll<HTMLButtonElement>(
    'button[type="button"]',
  );
  const raw = Array.from(tabs ?? []).find((b) => b.textContent === "Raw");
  act(() => {
    raw?.click();
  });
};

test("既定は Rendered 表示", () => {
  render({ ...baseValues, body: "# 見出し" });
  expect(
    container?.querySelector('[data-testid="preview-rendered"]'),
  ).not.toBeNull();
  expect(container?.querySelector('[data-testid="preview-raw"]')).toBeNull();
});

test("Raw タブ click で最終 markdown が <pre> に出る", () => {
  render({ ...baseValues, body: "本文テキスト" });
  clickRawTab();
  const raw = container?.querySelector('[data-testid="preview-raw"]');
  expect(raw?.tagName).toBe("PRE");
  expect(raw?.textContent).toBe(
    "---\ntitle: タスク\nstatus: Todo\n---\n本文テキスト",
  );
});

test("priority/labels が Raw プレビューの frontmatter に反映される", () => {
  render({
    ...baseValues,
    priority: "High",
    labels: ["bug"],
    body: "",
  });
  clickRawTab();
  const raw = container?.querySelector('[data-testid="preview-raw"]');
  expect(raw?.textContent).toContain("priority: High");
  expect(raw?.textContent).toContain("labels:\n  - bug");
});

test("本文のタスクリストが Rendered で MarkdownContent によりレンダリングされる", () => {
  render({ ...baseValues, body: "- [ ] やること\n- [x] 完了" });
  const content = container?.querySelector('[data-testid="markdown-content"]');
  expect(content).not.toBeNull();
  expect(content?.querySelectorAll('input[type="checkbox"]').length).toBe(2);
});

test("空本文でもエラーにならず最小 frontmatter を表示する", () => {
  render({ ...baseValues, body: "" });
  const rendered = container?.querySelector('[data-testid="preview-rendered"]');
  expect(rendered?.querySelector("pre")?.textContent).toBe(
    "---\ntitle: タスク\nstatus: Todo\n---",
  );
});
