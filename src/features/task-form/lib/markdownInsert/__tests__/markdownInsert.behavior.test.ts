import { expect, test } from "vitest";
import { MarkdownInsert } from "..";

test("bold: 選択範囲を ** で囲み、選択範囲は装飾の内側を指す", () => {
  const result = MarkdownInsert.apply("bold", "hello world", {
    start: 6,
    end: 11,
  });
  expect(result.text).toBe("hello **world**");
  expect(result.selection).toEqual({ start: 8, end: 13 });
});

test("italic: 選択範囲を * で囲み、選択範囲は装飾の内側を指す", () => {
  const result = MarkdownInsert.apply("italic", "hello world", {
    start: 6,
    end: 11,
  });
  expect(result.text).toBe("hello *world*");
  expect(result.selection).toEqual({ start: 7, end: 12 });
});

test("heading: カーソルのみ（選択なし）でその行の行頭に ## が付く", () => {
  const result = MarkdownInsert.apply("heading", "first\nsecond\nthird", {
    start: 8,
    end: 8,
  });
  expect(result.text).toBe("first\n## second\nthird");
  expect(result.selection).toEqual({ start: 11, end: 11 });
});

test("bulletList: 複数行選択で各行の行頭に - が付き選択範囲が追従する", () => {
  const text = "one\ntwo\nthree";
  const result = MarkdownInsert.apply("bulletList", text, {
    start: 0,
    end: text.length,
  });
  expect(result.text).toBe("- one\n- two\n- three");
  expect(result.selection).toEqual({ start: 2, end: 19 });
});

test("taskList: 複数行選択で各行の行頭に - [ ] が付く", () => {
  const result = MarkdownInsert.apply("taskList", "one\ntwo", {
    start: 0,
    end: 7,
  });
  expect(result.text).toBe("- [ ] one\n- [ ] two");
});

test.each([
  ["heading", "## one\n## two", "one\ntwo"],
  ["bulletList", "- one\n- two", "one\ntwo"],
  ["taskList", "- [ ] one\n- [ ] two", "one\ntwo"],
] as const)("トグル: %s で全対象行がプレフィックス済みなら剥がれる", (kind, prefixed, expected) => {
  const result = MarkdownInsert.apply(kind, prefixed, {
    start: 0,
    end: prefixed.length,
  });
  expect(result.text).toBe(expected);
});

test.each([
  ["heading", "first\nsecond"],
  ["bulletList", "one\ntwo"],
  ["taskList", "one\ntwo"],
] as const)("トグル: %s の 2 回適用は恒等になる", (kind, original) => {
  const once = MarkdownInsert.apply(kind, original, {
    start: 0,
    end: original.length,
  });
  const twice = MarkdownInsert.apply(kind, once.text, once.selection);
  expect(twice.text).toBe(original);
});

test("混在選択: 一部の行だけプレフィックス済みなら全行が付与で統一される", () => {
  const result = MarkdownInsert.apply("bulletList", "- one\ntwo", {
    start: 0,
    end: 9,
  });
  expect(result.text).toBe("- one\n- two");
});

test.each([
  ["- [x] done", "done"],
  ["- [X] done", "done"],
  ["* [ ] todo", "todo"],
  ["*   [x] todo", "todo"],
] as const)("taskList golden: %s は既タスク行と判定され剥がれる（domains/markdown の受理集合と同値）", (line, expected) => {
  const result = MarkdownInsert.apply("taskList", line, {
    start: 0,
    end: line.length,
  });
  expect(result.text).toBe(expected);
});

test.each([
  ["- [] x", "- [ ] - [] x"],
  ["- [ ]text", "- [ ] - [ ]text"],
] as const)("taskList golden: %s は task 行と判定されず付与される（[] / チェック後空白なしは task 行ではない）", (line, expected) => {
  const result = MarkdownInsert.apply("taskList", line, {
    start: 0,
    end: line.length,
  });
  expect(result.text).toBe(expected);
});

test("空テキスト + 空選択で bold は **** を挿入しカーソルが中央に置かれる", () => {
  const result = MarkdownInsert.apply("bold", "", { start: 0, end: 0 });
  expect(result.text).toBe("****");
  expect(result.selection).toEqual({ start: 2, end: 2 });
});

test("文末（最終行・改行なし）の行にもプレフィックスが付く", () => {
  const result = MarkdownInsert.apply("heading", "first\nlast", {
    start: 10,
    end: 10,
  });
  expect(result.text).toBe("first\n## last");
});

test("行の途中から次行の途中までの選択では掛かる全行が対象になる", () => {
  const result = MarkdownInsert.apply("bulletList", "one\ntwo\nthree", {
    start: 2,
    end: 9,
  });
  expect(result.text).toBe("- one\n- two\n- three");
});

test("逆転した選択範囲（start > end）は入れ替えて処理する", () => {
  const result = MarkdownInsert.apply("bold", "hello", { start: 5, end: 0 });
  expect(result.text).toBe("**hello**");
  expect(result.selection).toEqual({ start: 2, end: 7 });
});

test("text.length を超える選択範囲はクランプして処理し例外を投げない", () => {
  const result = MarkdownInsert.apply("heading", "abc", {
    start: -5,
    end: 100,
  });
  expect(result.text).toBe("## abc");
});

test("トグルで剥がした行のカーソルは行頭方向へ戻る", () => {
  const result = MarkdownInsert.apply("bulletList", "- one", {
    start: 5,
    end: 5,
  });
  expect(result.text).toBe("one");
  expect(result.selection).toEqual({ start: 3, end: 3 });
});

test("選択末尾が次行の行頭にある場合、その次行は対象に含めない（selectionEnd は exclusive）", () => {
  // "one\ntwo" の start:0 end:4 は 1 行目 + 改行のみの選択で、2 行目は未選択。
  const result = MarkdownInsert.apply("bulletList", "one\ntwo", {
    start: 0,
    end: 4,
  });
  expect(result.text).toBe("- one\ntwo");
});

test("末尾改行込みの全選択でも改行後の空行に付与しない", () => {
  const result = MarkdownInsert.apply("bulletList", "one\n", {
    start: 0,
    end: 4,
  });
  expect(result.text).toBe("- one\n");
});

test("空選択（カーソルが行頭）ではその行が対象になる", () => {
  const result = MarkdownInsert.apply("heading", "one\ntwo", {
    start: 4,
    end: 4,
  });
  expect(result.text).toBe("one\n## two");
});

test("quote: 1 行を選択して引用すると行頭に > が付く", () => {
  const result = MarkdownInsert.apply("quote", "hello", { start: 0, end: 5 });
  expect(result.text).toBe("> hello");
});

test("quote: 全行 > 済みで再適用すると剥がれる（トグル）", () => {
  const text = "> one\n> two";
  const result = MarkdownInsert.apply("quote", text, {
    start: 0,
    end: text.length,
  });
  expect(result.text).toBe("one\ntwo");
});

test("orderedList: 複数行選択で各行頭に 1. が付く", () => {
  const text = "one\ntwo";
  const result = MarkdownInsert.apply("orderedList", text, {
    start: 0,
    end: text.length,
  });
  expect(result.text).toBe("1. one\n1. two");
});

test.each([
  ["1. one\n1. two"],
  ["1. one\n2. two"],
  ["10.  one\n3.   two"],
] as const)("orderedList: 番号付き済み行（%s）で再適用すると番号が剥がれる", (text) => {
  const result = MarkdownInsert.apply("orderedList", text, {
    start: 0,
    end: text.length,
  });
  expect(result.text).toBe("one\ntwo");
});

test("code: 選択文字列を ` で囲み、選択範囲は装飾の内側を指す", () => {
  const result = MarkdownInsert.apply("code", "hello world", {
    start: 6,
    end: 11,
  });
  expect(result.text).toBe("hello `world`");
  expect(result.selection).toEqual({ start: 7, end: 12 });
});

test("code: 空選択で `` を挿入しカーソルが中央に置かれる", () => {
  const result = MarkdownInsert.apply("code", "", { start: 0, end: 0 });
  expect(result.text).toBe("``");
  expect(result.selection).toEqual({ start: 1, end: 1 });
});

test("code: 既に ` で囲まれた選択で再適用すると剥がれる（トグル）", () => {
  const result = MarkdownInsert.apply("code", "a `x` b", { start: 3, end: 4 });
  expect(result.text).toBe("a x b");
  expect(result.selection).toEqual({ start: 2, end: 3 });
});

test("link: 選択文字列を [選択]() に変換し、カーソルを () の内側へ移す", () => {
  const result = MarkdownInsert.apply("link", "see docs here", {
    start: 4,
    end: 8,
  });
  expect(result.text).toBe("see [docs]() here");
  // before(4) + selected("docs"=4) + "](".length 込みで 4 + 4 + 3 = 11
  expect(result.selection).toEqual({ start: 11, end: 11 });
});

test("link: 空選択では []() を生成しカーソルが () の内側へ入る", () => {
  const result = MarkdownInsert.apply("link", "", { start: 0, end: 0 });
  expect(result.text).toBe("[]()");
  expect(result.selection).toEqual({ start: 3, end: 3 });
});

test.each([
  ["quote"],
  ["orderedList"],
  ["code"],
  ["link"],
] as const)("空文字列 text への %s 適用は例外を投げず最小の記法を返す", (kind) => {
  expect(() =>
    MarkdownInsert.apply(kind, "", { start: 0, end: 0 }),
  ).not.toThrow();
});

test.each([
  ["quote"],
  ["orderedList"],
  ["code"],
  ["link"],
] as const)("%s で範囲外・負値 selection はクランプされ破綻しない", (kind) => {
  expect(() =>
    MarkdownInsert.apply(kind, "abc", { start: -5, end: 100 }),
  ).not.toThrow();
});
