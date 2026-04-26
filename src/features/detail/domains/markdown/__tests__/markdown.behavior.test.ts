import { expect, test } from "vitest";
import { Markdown } from "../index";

test("tokenizeInline: 装飾なし → text のみ", () => {
  expect(Markdown.tokenizeInline("abc")).toEqual([
    { type: "text", value: "abc" },
  ]);
});

test("tokenizeInline: code", () => {
  expect(Markdown.tokenizeInline("a`b`c")).toEqual([
    { type: "text", value: "a" },
    { type: "code", value: "b" },
    { type: "text", value: "c" },
  ]);
});

test("tokenizeInline: strong", () => {
  expect(Markdown.tokenizeInline("a**b**c")).toEqual([
    { type: "text", value: "a" },
    { type: "strong", value: "b" },
    { type: "text", value: "c" },
  ]);
});

test("tokenizeInline: 連続装飾", () => {
  expect(Markdown.tokenizeInline("`a`**b**")).toEqual([
    { type: "code", value: "a" },
    { type: "strong", value: "b" },
  ]);
});

test("tokenizeInline: 空文字", () => {
  expect(Markdown.tokenizeInline("")).toEqual([]);
});

test("parse: 空 body → []", () => {
  expect(Markdown.parse("")).toEqual([]);
});

test("parse: 空白のみ body → []", () => {
  expect(Markdown.parse("   \n  \n")).toEqual([]);
});

test("parse: h1", () => {
  expect(Markdown.parse("# h1")).toEqual([{ type: "h1", text: "h1" }]);
});

test("parse: h2 / h3", () => {
  expect(Markdown.parse("## h2")).toEqual([{ type: "h2", text: "h2" }]);
  expect(Markdown.parse("### h3")).toEqual([{ type: "h3", text: "h3" }]);
});

test("parse: ul (-)", () => {
  expect(Markdown.parse("- a\n- b")).toEqual([
    { type: "ul", items: ["a", "b"] },
  ]);
});

test("parse: ul (*)", () => {
  expect(Markdown.parse("* a\n* b")).toEqual([
    { type: "ul", items: ["a", "b"] },
  ]);
});

test("parse: codeblock 単一行", () => {
  expect(Markdown.parse("```\ncode\n```")).toEqual([
    { type: "codeblock", code: "code" },
  ]);
});

test("parse: codeblock 複数行", () => {
  expect(Markdown.parse("```\nline1\nline2\n```")).toEqual([
    { type: "codeblock", code: "line1\nline2" },
  ]);
});

test("parse: paragraph 単一行", () => {
  expect(Markdown.parse("hello")).toEqual([
    { type: "paragraph", text: "hello" },
  ]);
});

test("parse: paragraph 複数行は半角スペースで連結", () => {
  expect(Markdown.parse("line1\nline2")).toEqual([
    { type: "paragraph", text: "line1 line2" },
  ]);
});

test("parse: 空行で paragraph 分割", () => {
  expect(Markdown.parse("a\n\nb")).toEqual([
    { type: "paragraph", text: "a" },
    { type: "paragraph", text: "b" },
  ]);
});

test("parse: 連続空行も同じ（empty block を作らない）", () => {
  expect(Markdown.parse("a\n\n\nb")).toEqual([
    { type: "paragraph", text: "a" },
    { type: "paragraph", text: "b" },
  ]);
});

test("parse: <script> はそのまま保持（エスケープは React 側）", () => {
  expect(Markdown.parse("<script>alert(1)</script>")).toEqual([
    { type: "paragraph", text: "<script>alert(1)</script>" },
  ]);
});

test("parse: CRLF を含む入力が LF と同等に解釈される", () => {
  expect(Markdown.parse("line1\r\nline2")).toEqual(
    Markdown.parse("line1\nline2"),
  );
  expect(Markdown.parse("# h1\r\n\r\n- a\r\n- b")).toEqual(
    Markdown.parse("# h1\n\n- a\n- b"),
  );
});

test("parse: 単独 \\r を含む入力が \\n と同等に解釈される", () => {
  expect(Markdown.parse("line1\rline2")).toEqual(
    Markdown.parse("line1\nline2"),
  );
  expect(Markdown.parse("# h1\r\r- a\r- b")).toEqual(
    Markdown.parse("# h1\n\n- a\n- b"),
  );
  expect(Markdown.parse("a\r\nb\rc")).toEqual(Markdown.parse("a\nb\nc"));
});

test("parse: fence 行の言語タグはパース対象外", () => {
  expect(Markdown.parse("```ts\nconst x = 1;\n```")).toEqual([
    { type: "codeblock", code: "const x = 1;" },
  ]);
  expect(Markdown.parse("```js\nlet y = 2;\n```")).toEqual([
    { type: "codeblock", code: "let y = 2;" },
  ]);
  expect(Markdown.parse("```\ncode\n```")).toEqual(
    Markdown.parse("```ts\ncode\n```"),
  );
});

test("parse: 未閉鎖 code fence は残り全文を code block として扱う", () => {
  expect(Markdown.parse("```\ncode\nmore\n")).toEqual([
    { type: "codeblock", code: "code\nmore\n" },
  ]);
  expect(Markdown.parse("# h1\n```\nstill code\n")).toEqual([
    { type: "h1", text: "h1" },
    { type: "codeblock", code: "still code\n" },
  ]);
});

test("parse: code block 内の **bold** はそのままテキストとして残る", () => {
  expect(Markdown.parse("```\n**bold**\n```")).toEqual([
    { type: "codeblock", code: "**bold**" },
  ]);
  expect(Markdown.parse("```\n`code`\n**b**\n```")).toEqual([
    { type: "codeblock", code: "`code`\n**b**" },
  ]);
});
