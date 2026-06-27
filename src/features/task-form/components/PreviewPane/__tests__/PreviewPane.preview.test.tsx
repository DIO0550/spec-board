import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { LabelsField } from "@/features/task-form/lib/fields/labels";
import { PreviewFrontmatter } from "@/features/task-form/lib/previewFrontmatter";
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

type Payload = { frontmatter: PreviewFrontmatter; body: string };

const baseFrontmatter = {
  title: "タスク",
  status: "Todo",
  parent: undefined,
  labels: LabelsField.initial([]),
  links: [],
};

const render = (
  payload: Payload,
  options: { fileName?: string; onCollapse?: () => void } = {},
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PreviewPane, {
        frontmatter: payload.frontmatter,
        body: payload.body,
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
  const raw = Array.from(tabs ?? []).find((b) => b.textContent === "Raw");
  act(() => {
    raw?.click();
  });
};

test("既定は Rendered 表示", () => {
  render({
    frontmatter: PreviewFrontmatter.from(baseFrontmatter),
    body: "# 見出し",
  });
  expect(
    container?.querySelector('[data-testid="preview-rendered"]'),
  ).not.toBeNull();
  expect(container?.querySelector('[data-testid="preview-raw"]')).toBeNull();
});

test("Raw タブ click で最終 markdown が <pre> に出る", () => {
  render({
    frontmatter: PreviewFrontmatter.from(baseFrontmatter),
    body: "本文テキスト",
  });
  clickRawTab();
  const raw = container?.querySelector('[data-testid="preview-raw"]');
  expect(raw?.tagName).toBe("PRE");
  expect(raw?.textContent).toBe(
    "---\ntitle: タスク\nstatus: Todo\n---\n本文テキスト",
  );
});

test("priority/labels が Raw プレビューの frontmatter に反映される", () => {
  render({
    frontmatter: PreviewFrontmatter.from({
      ...baseFrontmatter,
      priority: "High",
      labels: LabelsField.initial(["bug"]),
    }),
    body: "",
  });
  clickRawTab();
  const raw = container?.querySelector('[data-testid="preview-raw"]');
  expect(raw?.textContent).toContain("priority: High");
  expect(raw?.textContent).toContain("labels:\n  - bug");
});

test("本文のタスクリストが Rendered で MarkdownContent によりレンダリングされる", () => {
  render({
    frontmatter: PreviewFrontmatter.from(baseFrontmatter),
    body: "- [ ] やること\n- [x] 完了",
  });
  const content = container?.querySelector('[data-testid="markdown-content"]');
  expect(content).not.toBeNull();
  expect(content?.querySelectorAll('input[type="checkbox"]').length).toBe(2);
});

test("空本文でもエラーにならず最小 frontmatter を表示する", () => {
  render({
    frontmatter: PreviewFrontmatter.from(baseFrontmatter),
    body: "",
  });
  const rendered = container?.querySelector('[data-testid="preview-rendered"]');
  expect(rendered?.querySelector("pre")?.textContent).toBe(
    "---\ntitle: タスク\nstatus: Todo\n---",
  );
});

test("pv-meta に最終 markdown の UTF-8 バイト長 + B が表示される", () => {
  render({
    frontmatter: PreviewFrontmatter.from(baseFrontmatter),
    body: "本文テキスト",
  });
  const finalMarkdown = "---\ntitle: タスク\nstatus: Todo\n---\n本文テキスト";
  const expectedBytes = new TextEncoder().encode(finalMarkdown).length;
  const meta = container?.querySelector('[data-testid="preview-meta"]');
  expect(meta?.textContent).toContain(`${expectedBytes}B`);
});

test("空本文では Raw に出る最終 markdown と同じバイト長が表示される", () => {
  render({
    frontmatter: PreviewFrontmatter.from(baseFrontmatter),
    body: "",
  });
  clickRawTab();
  const finalMarkdown =
    container?.querySelector('[data-testid="preview-raw"]')?.textContent ?? "";
  const expectedBytes = new TextEncoder().encode(finalMarkdown).length;
  const meta = container?.querySelector('[data-testid="preview-meta"]');
  expect(meta?.textContent).toContain(`${expectedBytes}B`);
});

test("pv-collapse クリックで onCollapse が 1 回呼ばれる", () => {
  const onCollapse = vi.fn();
  render(
    {
      frontmatter: PreviewFrontmatter.from(baseFrontmatter),
      body: "",
    },
    { onCollapse },
  );
  const collapse = container?.querySelector(
    '[data-testid="preview-collapse"]',
  ) as HTMLButtonElement;
  act(() => {
    collapse.click();
  });
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

test("pv-foot に保存先ファイル名が表示される", () => {
  render(
    {
      frontmatter: PreviewFrontmatter.from(baseFrontmatter),
      body: "",
    },
    { fileName: "my-task.md" },
  );
  const foot = container?.querySelector('[data-testid="preview-foot"]');
  expect(foot?.textContent).toContain("my-task.md");
  expect(foot?.textContent).toContain("新規作成されます");
});
