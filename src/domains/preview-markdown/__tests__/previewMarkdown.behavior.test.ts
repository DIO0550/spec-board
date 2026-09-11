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
