import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { PreviewMarkdownState } from "@/features/task-form/hooks/usePreviewTaskMarkdown";
import { TauriError } from "@/lib/tauri";
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

const MARKDOWN =
  "---\ntitle: タスク\nstatus: Todo\nlabels:\n  - bug\n---\n# 見出し\n\n本文テキスト";

const ready = (markdown = MARKDOWN): PreviewMarkdownState => ({
  kind: "ready",
  markdown,
  error: null,
});

const render = (
  state: PreviewMarkdownState,
  options: { fileName?: string; onCollapse?: () => void } = {},
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PreviewPane, {
        state,
        fileName: options.fileName ?? "new-issue.md",
        onCollapse: options.onCollapse ?? vi.fn(),
      }),
    );
  });
};

const clickRawTab = () => {
  const tabs = container?.querySelectorAll<HTMLButtonElement>(
    'button[type="button"]',
  );
  const raw = Array.from(tabs ?? []).find(
    (button) => button.textContent === "Raw",
  );
  act(() => {
    raw?.click();
  });
};

test("ready state の既定は Rendered 表示で frontmatter と本文を分ける", () => {
  render(ready());
  expect(
    container?.querySelector('[data-testid="preview-rendered"]'),
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-testid="preview-rendered"] pre')
      ?.textContent,
  ).toBe("---\ntitle: タスク\nstatus: Todo\nlabels:\n  - bug\n---");
  expect(
    container?.querySelector('[data-testid="markdown-content"]'),
  ).not.toBeNull();
});

test("Raw タブは BE が返した full markdown をそのまま表示する", () => {
  render(ready());
  clickRawTab();
  expect(
    container?.querySelector('[data-testid="preview-raw"]')?.textContent,
  ).toBe(MARKDOWN);
});

test("backend の labels を含む frontmatter は再 stringify せず表示する", () => {
  const markdown =
    "---\ntitle: 'Title: #1'\nlabels:\n- needs:review\n---\n本文";
  render(ready(markdown));
  expect(
    container?.querySelector('[data-testid="preview-rendered"] pre')
      ?.textContent,
  ).toBe("---\ntitle: 'Title: #1'\nlabels:\n- needs:review\n---");
});

test("本文のタスクリストが Rendered で MarkdownContent により描画される", () => {
  render(ready("---\ntitle: タスク\n---\n- [ ] やること\n- [x] 完了"));
  expect(
    container?.querySelector('[data-testid="markdown-content"]'),
  ).not.toBeNull();
  expect(
    container?.querySelectorAll(
      '[data-testid="markdown-content"] input[type="checkbox"]',
    ).length,
  ).toBe(2);
});

test("空本文の full markdown もエラーにならず frontmatter を表示する", () => {
  render(ready("---\ntitle: タスク\n---\n"));
  expect(
    container?.querySelector('[data-testid="preview-rendered"] pre')
      ?.textContent,
  ).toBe("---\ntitle: タスク\n---");
});

test("pv-meta に BE が返した full markdown の UTF-8 バイト長が表示される", () => {
  render(ready());
  const expectedBytes = new TextEncoder().encode(MARKDOWN).length;
  expect(
    container?.querySelector('[data-testid="preview-meta"]')?.textContent,
  ).toContain(`${expectedBytes}B`);
});

test("pending state は古い markdown を表示せず生成中を表示する", () => {
  render({ kind: "pending", markdown: null, error: null });
  expect(
    container?.querySelector('[data-testid="preview-pending"]'),
  ).not.toBeNull();
  expect(container?.querySelector('[data-testid="preview-raw"]')).toBeNull();
  expect(
    container?.querySelector('[data-testid="preview-meta"]')?.textContent,
  ).toContain("0B");
});

test("error state はエラーを表示し、古い markdown に fallback しない", () => {
  render({
    kind: "error",
    markdown: null,
    error: new TauriError("PARSE_ERROR", "preview failed"),
  });
  expect(
    container?.querySelector('[data-testid="preview-error"]')?.textContent,
  ).toContain("preview failed");
  expect(
    container?.querySelector('[data-testid="preview-rendered"]'),
  ).toBeNull();
});

test("壊れた full markdown は raw/rendered を表示せずエラーにする", () => {
  render(ready("not markdown"));
  expect(
    container?.querySelector('[data-testid="preview-error"]'),
  ).not.toBeNull();
  expect(container?.querySelector('[data-testid="preview-raw"]')).toBeNull();
  expect(
    container?.querySelector('[data-testid="preview-meta"]')?.textContent,
  ).toContain("0B");
});

test("pv-collapse クリックで onCollapse が 1 回呼ばれる", () => {
  const onCollapse = vi.fn();
  render(ready(), { onCollapse });
  const collapse = container?.querySelector(
    '[data-testid="preview-collapse"]',
  ) as HTMLButtonElement;
  act(() => {
    collapse.click();
  });
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

test("pv-foot に保存先ファイル名が表示される", () => {
  render(ready(), { fileName: "my-task.md" });
  const foot = container?.querySelector('[data-testid="preview-foot"]');
  expect(foot?.textContent).toContain("my-task.md");
  expect(foot?.textContent).toContain("新規作成されます");
});
