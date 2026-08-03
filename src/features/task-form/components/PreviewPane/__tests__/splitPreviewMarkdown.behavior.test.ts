import { expect, test } from "vitest";
import { splitPreviewMarkdown } from "../splitPreviewMarkdown";

test("full markdown を最初の closing fence 位置だけで分割する", () => {
  expect(splitPreviewMarkdown("---\ntitle: A\n---\n本文\n---\n後続")).toEqual({
    frontmatter: "---\ntitle: A\n---",
    body: "本文\n---\n後続",
  });
});

test("壊れた fence は null を返す", () => {
  expect(splitPreviewMarkdown("title: A\n本文")).toBeNull();
  expect(splitPreviewMarkdown("---\ntitle: A\n")).toBeNull();
});

test("CRLF は表示用に LF へ正規化する", () => {
  expect(splitPreviewMarkdown("---\r\ntitle: A\r\n---\r\n本文")).toEqual({
    frontmatter: "---\ntitle: A\n---",
    body: "本文",
  });
});
