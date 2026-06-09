import { expect, test } from "vitest";
import { buildPreviewFrontmatter, type PreviewFrontmatterInput } from "..";

const baseInput: PreviewFrontmatterInput = {
  title: "タスク",
  status: "todo",
  labels: [],
  links: [],
};

test("title+status のみのとき最小 frontmatter を返す", () => {
  expect(buildPreviewFrontmatter(baseInput)).toBe(
    "---\ntitle: タスク\nstatus: todo\n---",
  );
});

test("priority 指定時は status の次行に出力する", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, priority: "high" })).toBe(
    "---\ntitle: タスク\nstatus: todo\npriority: high\n---",
  );
});

test("labels は labels: 見出し + インデント付き list item で出力する", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, labels: ["bug", "ui"] })).toBe(
    "---\ntitle: タスク\nstatus: todo\nlabels:\n  - bug\n  - ui\n---",
  );
});

test("parent は labels の次に出力する", () => {
  expect(
    buildPreviewFrontmatter({
      ...baseInput,
      labels: ["bug"],
      parent: "tasks/parent.md",
    }),
  ).toBe(
    "---\ntitle: タスク\nstatus: todo\nlabels:\n  - bug\nparent: tasks/parent.md\n---",
  );
});

test("links は links: 見出し + list item で出力する", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, links: ["tasks/a.md"] })).toBe(
    "---\ntitle: タスク\nstatus: todo\nlinks:\n  - tasks/a.md\n---",
  );
});

test("全項目ありで title→status→priority→labels→parent→links の順に出力する", () => {
  expect(
    buildPreviewFrontmatter({
      title: "タスク",
      status: "todo",
      priority: "high",
      labels: ["bug", "ui"],
      parent: "tasks/parent.md",
      links: ["tasks/a.md", "tasks/b.md"],
    }),
  ).toBe(
    [
      "---",
      "title: タスク",
      "status: todo",
      "priority: high",
      "labels:",
      "  - bug",
      "  - ui",
      "parent: tasks/parent.md",
      "links:",
      "  - tasks/a.md",
      "  - tasks/b.md",
      "---",
    ].join("\n"),
  );
});

test.each([
  { label: "空文字", priority: "" },
  { label: "未指定", priority: undefined },
])("priority が $label のとき priority 行を省略する", ({ priority }) => {
  expect(buildPreviewFrontmatter({ ...baseInput, priority })).toBe(
    "---\ntitle: タスク\nstatus: todo\n---",
  );
});

test("labels・links が空配列のとき当該ブロックを省略する", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, labels: [], links: [] })).toBe(
    "---\ntitle: タスク\nstatus: todo\n---",
  );
});

test("parent が空文字のとき parent 行を省略する", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, parent: "" })).toBe(
    "---\ntitle: タスク\nstatus: todo\n---",
  );
});

test("scalar 値にコロンを含むとき生値がそのまま行に入る（エスケープしない）", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, title: "fix: bug" })).toBe(
    "---\ntitle: fix: bug\nstatus: todo\n---",
  );
});

test("scalar 値に改行を含むとき出力が複数行に割れる（崩れ方を固定）", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, title: "line1\nline2" })).toBe(
    "---\ntitle: line1\nline2\nstatus: todo\n---",
  );
});

test("scalar 値の先頭が # / 先頭スペースでも生値がそのまま出る", () => {
  expect(buildPreviewFrontmatter({ ...baseInput, title: "# heading" })).toBe(
    "---\ntitle: # heading\nstatus: todo\n---",
  );
});

test("list item にコロン・先頭 # を含むとき - <生値> がそのまま出る", () => {
  expect(
    buildPreviewFrontmatter({ ...baseInput, labels: ["a: b", "#tag"] }),
  ).toBe("---\ntitle: タスク\nstatus: todo\nlabels:\n  - a: b\n  - #tag\n---");
});

test("list item に改行・先頭スペースを含むとき - <生値> がそのまま出る", () => {
  expect(
    buildPreviewFrontmatter({ ...baseInput, links: ["a\nb", " spaced"] }),
  ).toBe(
    "---\ntitle: タスク\nstatus: todo\nlinks:\n  - a\nb\n  -  spaced\n---",
  );
});
