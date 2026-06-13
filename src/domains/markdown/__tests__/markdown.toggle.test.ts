import { expect, test } from "vitest";
import { Markdown } from "..";

test("toggleTaskAt: off→on", () => {
  expect(Markdown.toggleTaskAt("- [ ] a", 0)).toBe("- [x] a");
});

test("toggleTaskAt: on→off", () => {
  expect(Markdown.toggleTaskAt("- [x] a", 0)).toBe("- [ ] a");
});

test("toggleTaskAt: 大文字 [X] は [ ] に戻る", () => {
  expect(Markdown.toggleTaskAt("- [X] a", 0)).toBe("- [ ] a");
});

test("toggleTaskAt: * リスト", () => {
  expect(Markdown.toggleTaskAt("* [ ] a", 0)).toBe("* [x] a");
});

test("toggleTaskAt: 同一文言の指定行のみ反転", () => {
  expect(Markdown.toggleTaskAt("- [ ] dup\n- [ ] dup", 1)).toBe(
    "- [ ] dup\n- [x] dup",
  );
});

test("toggleTaskAt: CRLF 改行をすべて保持する", () => {
  expect(Markdown.toggleTaskAt("- [ ] a\r\n- [ ] b\r\n", 1)).toBe(
    "- [ ] a\r\n- [x] b\r\n",
  );
});

test("toggleTaskAt: 見出し・空行・他行・改行は不変", () => {
  expect(Markdown.toggleTaskAt("# h\n\n- [ ] a\n外部リンク", 2)).toBe(
    "# h\n\n- [x] a\n外部リンク",
  );
});

test("toggleTaskAt: 空 checkbox も反転する", () => {
  expect(Markdown.toggleTaskAt("- [ ]", 0)).toBe("- [x]");
});

test("toggleTaskAt: 範囲外 index は原文を返す", () => {
  expect(Markdown.toggleTaskAt("- [ ] a", 5)).toBe("- [ ] a");
});

test("toggleTaskAt: 非 task 行 index は原文を返す", () => {
  expect(Markdown.toggleTaskAt("plain\n- [ ] a", 0)).toBe("plain\n- [ ] a");
});
