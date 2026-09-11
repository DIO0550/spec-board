import { expect, test } from "vitest";
import { PreviewMarkdown } from "..";

test("最初の closing fence 位置だけで分割する", () => {
  expect(PreviewMarkdown.split("---\ntitle: A\n---\n本文\n---\n後続")).toEqual({
    frontmatter: "---\ntitle: A\n---",
    body: "本文\n---\n後続",
  });
});

test("壊れた fence は undefined を返す", () => {
  expect(PreviewMarkdown.split("title: A\n本文")).toBeUndefined();
  expect(PreviewMarkdown.split("---\ntitle: A\n")).toBeUndefined();
});

test("CRLF を LF に正規化する", () => {
  expect(PreviewMarkdown.split("---\r\ntitle: A\r\n---\r\n本文")).toEqual({
    frontmatter: "---\ntitle: A\n---",
    body: "本文",
  });
});

test.each([
  {
    label: "行頭 ---- を含む",
    markdown: "---\ntitle: A\n----\n---\n本文",
    frontmatter: "---\ntitle: A\n----\n---",
  },
  {
    label: "行頭 ---x を含む",
    markdown: "---\ntitle: A\n---x\n---\n本文",
    frontmatter: "---\ntitle: A\n---x\n---",
  },
  {
    label: "末尾空白付き --- を含む",
    markdown: "---\ntitle: A\n--- \n---\n本文",
    frontmatter: "---\ntitle: A\n--- \n---",
  },
  {
    label: "偽候補が複数連続する",
    markdown: "---\ntitle: A\n----\n---x\n---\n本文",
    frontmatter: "---\ntitle: A\n----\n---x\n---",
  },
])("frontmatter 値が $label 場合は後続の閉じフェンスで分割する", ({
  markdown,
  frontmatter,
}) => {
  expect(PreviewMarkdown.split(markdown)).toEqual({
    frontmatter,
    body: "本文",
  });
});

test("偽候補の後の閉じフェンスが入力末尾なら body は空文字列になる", () => {
  expect(PreviewMarkdown.split("---\ntitle: A\n----\n---")).toEqual({
    frontmatter: "---\ntitle: A\n----\n---",
    body: "",
  });
});

test.each([
  { label: "行頭 ---- のみ", markdown: "---\ntitle: A\n----\n本文" },
  { label: "末尾空白付き --- のみ", markdown: "---\ntitle: A\n--- \n本文" },
  { label: "行頭 ---- で終端", markdown: "---\ntitle: A\n----" },
  { label: "空文字列", markdown: "" },
])("$label で閉じフェンスが無い場合は undefined を返す", ({ markdown }) => {
  expect(PreviewMarkdown.split(markdown)).toBeUndefined();
});
