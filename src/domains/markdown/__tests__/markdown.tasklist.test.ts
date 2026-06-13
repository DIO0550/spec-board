import { expect, test } from "vitest";
import { Markdown, type TaskListItem } from "..";

test("parse: task-list を判別 union で分解する", () => {
  expect(Markdown.parse("- [ ] a\n- [x] b")).toEqual([
    {
      type: "ul",
      items: [
        { kind: "task", checked: false, sourceLine: 0, text: "a" },
        { kind: "task", checked: true, sourceLine: 1, text: "b" },
      ],
    },
  ]);
});

test("parse: 大文字 [X] も checked task になる", () => {
  expect(Markdown.parse("- [X] a")).toEqual([
    {
      type: "ul",
      items: [{ kind: "task", checked: true, sourceLine: 0, text: "a" }],
    },
  ]);
});

test("parse: * リストの task", () => {
  expect(Markdown.parse("* [ ] a")).toEqual([
    {
      type: "ul",
      items: [{ kind: "task", checked: false, sourceLine: 0, text: "a" }],
    },
  ]);
});

test("parse: task と plain が同一 ul 内に項目順で並ぶ", () => {
  expect(Markdown.parse("- [ ] a\n- plain\n- [x] b")).toEqual([
    {
      type: "ul",
      items: [
        { kind: "task", checked: false, sourceLine: 0, text: "a" },
        { kind: "plain", text: "plain" },
        { kind: "task", checked: true, sourceLine: 2, text: "b" },
      ],
    },
  ]);
});

test("parse: 空 checkbox `- [ ]` は本文なしの未チェック task", () => {
  expect(Markdown.parse("- [ ]")).toEqual([
    {
      type: "ul",
      items: [{ kind: "task", checked: false, sourceLine: 0, text: "" }],
    },
  ]);
});

test("parse: `- []`（角括弧内に空白なし）は task ではなく plain", () => {
  expect(Markdown.parse("- []")).toEqual([
    {
      type: "ul",
      items: [{ kind: "plain", text: "[]" }],
    },
  ]);
});

test("parse: `- [ ]text`（] 直後に空白なし）は task ではなく plain", () => {
  expect(Markdown.parse("- [ ]text")).toEqual([
    {
      type: "ul",
      items: [{ kind: "plain", text: "[ ]text" }],
    },
  ]);
});

test("parse: sourceLine は source 上の行番号（見出し・空行・plain も行数に数える）", () => {
  expect(Markdown.parse("# h\n\n- plain\n- [ ] a\n- [x] b")).toEqual([
    { type: "h1", text: "h" },
    {
      type: "ul",
      items: [
        { kind: "plain", text: "plain" },
        { kind: "task", checked: false, sourceLine: 3, text: "a" },
        { kind: "task", checked: true, sourceLine: 4, text: "b" },
      ],
    },
  ]);
});

test("parse: 複数 ul ブロックを跨いでも sourceLine は実行番号", () => {
  expect(Markdown.parse("- [ ] a\n\n段落\n\n- [x] b")).toEqual([
    {
      type: "ul",
      items: [{ kind: "task", checked: false, sourceLine: 0, text: "a" }],
    },
    { type: "paragraph", text: "段落" },
    {
      type: "ul",
      items: [{ kind: "task", checked: true, sourceLine: 4, text: "b" }],
    },
  ]);
});

test("parse: codeblock 内の `- [ ]` 風行は task 化されず fence 外のみ task", () => {
  expect(Markdown.parse("```\n- [ ] x\n```\n- [ ] real")).toEqual([
    { type: "codeblock", code: "- [ ] x" },
    {
      type: "ul",
      items: [{ kind: "task", checked: false, sourceLine: 3, text: "real" }],
    },
  ]);
});

test("parse: インデント付き `  - [ ] x` は task 化しない（ネスト非対応）", () => {
  expect(Markdown.parse("  - [ ] indented")).toEqual([
    { type: "paragraph", text: "  - [ ] indented" },
  ]);
});

test("countTaskProgress: checked 数と task 総数を集計する", () => {
  const items: readonly TaskListItem[] = [
    { kind: "task", checked: false, sourceLine: 0, text: "a" },
    { kind: "task", checked: true, sourceLine: 1, text: "b" },
    { kind: "task", checked: true, sourceLine: 2, text: "c" },
  ];
  expect(Markdown.countTaskProgress(items)).toEqual({ done: 2, total: 3 });
});

test("countTaskProgress: checkbox 0 件（全 plain）は {done:0,total:0}", () => {
  const items: readonly TaskListItem[] = [
    { kind: "plain", text: "a" },
    { kind: "plain", text: "b" },
  ];
  expect(Markdown.countTaskProgress(items)).toEqual({ done: 0, total: 0 });
});

test("countTaskProgress: plain 項目は total から除外する", () => {
  const items: readonly TaskListItem[] = [
    { kind: "task", checked: false, sourceLine: 0, text: "a" },
    { kind: "plain", text: "b" },
    { kind: "plain", text: "c" },
  ];
  expect(Markdown.countTaskProgress(items)).toEqual({ done: 0, total: 1 });
});
