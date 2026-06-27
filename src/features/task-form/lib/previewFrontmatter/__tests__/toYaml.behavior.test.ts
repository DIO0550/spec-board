import { expect, test } from "vitest";
import { LabelsField } from "@/features/task-form/lib/fields/labels";
import { PreviewFrontmatter } from "..";

const baseInput = {
  title: "タスク",
  status: "todo",
  parent: undefined,
  labels: LabelsField.initial([]),
  links: [],
};

test("title+status のみのとき最小 frontmatter を返す", () => {
  expect(PreviewFrontmatter.toYaml(PreviewFrontmatter.from(baseInput))).toBe(
    "---\ntitle: タスク\nstatus: todo\n---",
  );
});

test("priority 指定時は status の次行に出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, priority: "high" }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\npriority: high\n---");
});

test("labels は labels: 見出し + インデント付き list item で出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        ...baseInput,
        labels: LabelsField.initial(["bug", "ui"]),
      }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\nlabels:\n  - bug\n  - ui\n---");
});

test("parent は labels の次に出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        ...baseInput,
        labels: LabelsField.initial(["bug"]),
        parent: "tasks/parent.md",
      }),
    ),
  ).toBe(
    "---\ntitle: タスク\nstatus: todo\nlabels:\n  - bug\nparent: tasks/parent.md\n---",
  );
});

test("links は links: 見出し + list item で出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, links: ["tasks/a.md"] }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\nlinks:\n  - tasks/a.md\n---");
});

test("全項目ありで title→status→priority→labels→parent→links の順に出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        title: "タスク",
        status: "todo",
        priority: "high",
        labels: LabelsField.initial(["bug", "ui"]),
        parent: "tasks/parent.md",
        links: ["tasks/a.md", "tasks/b.md"],
      }),
    ),
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
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, priority }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\n---");
});

test("labels・links が空配列のとき当該ブロックを省略する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        ...baseInput,
        labels: LabelsField.initial([]),
        links: [],
      }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\n---");
});

test("parent が空文字のとき parent 行を省略する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, parent: "" }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\n---");
});

test("scalar 値にコロンを含むとき生値がそのまま行に入る（エスケープしない）", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, title: "fix: bug" }),
    ),
  ).toBe("---\ntitle: fix: bug\nstatus: todo\n---");
});

test("scalar 値に改行を含むとき出力が複数行に割れる（崩れ方を固定）", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, title: "line1\nline2" }),
    ),
  ).toBe("---\ntitle: line1\nline2\nstatus: todo\n---");
});

test("scalar 値の先頭が # / 先頭スペースでも生値がそのまま出る", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, title: "# heading" }),
    ),
  ).toBe("---\ntitle: # heading\nstatus: todo\n---");
});

test("list item にコロン・先頭 # を含むとき - <生値> がそのまま出る", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        ...baseInput,
        labels: LabelsField.initial(["a: b", "#tag"]),
      }),
    ),
  ).toBe("---\ntitle: タスク\nstatus: todo\nlabels:\n  - a: b\n  - #tag\n---");
});

test("list item に改行・先頭スペースを含むとき - <生値> がそのまま出る", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({ ...baseInput, links: ["a\nb", " spaced"] }),
    ),
  ).toBe(
    "---\ntitle: タスク\nstatus: todo\nlinks:\n  - a\nb\n  -  spaced\n---",
  );
});

test("due 指定時は links の後（末尾）に出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        ...baseInput,
        links: ["tasks/a.md"],
        due: "2026-07-01",
      }),
    ),
  ).toBe(
    "---\ntitle: タスク\nstatus: todo\nlinks:\n  - tasks/a.md\ndue: 2026-07-01\n---",
  );
});

test.each([[undefined], [""]])("due が %j のとき due 行を省略する", (due) => {
  expect(
    PreviewFrontmatter.toYaml(PreviewFrontmatter.from({ ...baseInput, due })),
  ).toBe("---\ntitle: タスク\nstatus: todo\n---");
});

test("draft: true のとき links の後・due の前に draft 行を出力する", () => {
  expect(
    PreviewFrontmatter.toYaml(
      PreviewFrontmatter.from({
        ...baseInput,
        links: ["tasks/a.md"],
        draft: true,
        due: "2026-07-01",
      }),
    ),
  ).toBe(
    "---\ntitle: タスク\nstatus: todo\nlinks:\n  - tasks/a.md\ndraft: true\ndue: 2026-07-01\n---",
  );
});

test.each([
  [undefined],
  [false],
])("draft が %j のとき draft 行を省略する", (draft) => {
  expect(
    PreviewFrontmatter.toYaml(PreviewFrontmatter.from({ ...baseInput, draft })),
  ).toBe("---\ntitle: タスク\nstatus: todo\n---");
});
