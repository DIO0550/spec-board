import { expect, test } from "vitest";
import { Markdown } from "../index";

test("parse: blockquote 単行", () => {
  expect(Markdown.parse("> quote")).toEqual([
    { type: "blockquote", lines: ["quote"] },
  ]);
});

test("parse: blockquote 連続行は 1 ブロックに収集", () => {
  expect(Markdown.parse("> l1\n> l2")).toEqual([
    { type: "blockquote", lines: ["l1", "l2"] },
  ]);
});

test("parse: blockquote は `>` 直後の空白 1 つだけを除去する", () => {
  expect(Markdown.parse(">  二つ空白")).toEqual([
    { type: "blockquote", lines: [" 二つ空白"] },
  ]);
});

test("parse: `>` のみの行は空文字行として収集", () => {
  expect(Markdown.parse(">")).toEqual([{ type: "blockquote", lines: [""] }]);
});

test("parse: blockquote は paragraph と区切られる", () => {
  expect(Markdown.parse("para\n> quote")).toEqual([
    { type: "paragraph", text: "para" },
    { type: "blockquote", lines: ["quote"] },
  ]);
});
