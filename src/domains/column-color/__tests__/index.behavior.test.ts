import { expect, test } from "vitest";
import { ColumnColor } from "..";

const FALLBACK_TOKEN_PATTERN = /^var\(--color-column-accent-\d+\)$/;

test("color 指定時は正規化した小文字 hex を返す", () => {
  expect(ColumnColor.resolveAccent("#1A2B3C", 0)).toBe("#1a2b3c");
});

test("既に小文字の hex はそのまま返す", () => {
  expect(ColumnColor.resolveAccent("#abcdef", 0)).toBe("#abcdef");
});

test("color 未指定時は order index に対応するフォールバックトークンを返す", () => {
  expect(ColumnColor.resolveAccent(undefined, 0)).toMatch(
    FALLBACK_TOKEN_PATTERN,
  );
});

test("同一 order のフォールバックは決定的に同値", () => {
  expect(ColumnColor.resolveAccent(undefined, 2)).toBe(
    ColumnColor.resolveAccent(undefined, 2),
  );
});

test("order が異なればフォールバックトークンも変わる", () => {
  expect(ColumnColor.resolveAccent(undefined, 0)).not.toBe(
    ColumnColor.resolveAccent(undefined, 1),
  );
});

test.each([
  ["不正な色名", "red"],
  ["空文字", ""],
  ["桁不足の hex", "#12345"],
  ["# 欠落", "1a2b3c"],
  ["非 hex 文字を含む", "#gggggg"],
])("不正な color（%s）はフォールバックトークンへ倒す", (_label, raw) => {
  expect(ColumnColor.resolveAccent(raw, 1)).toMatch(FALLBACK_TOKEN_PATTERN);
});

test("order がパレット長を大きく超えても循環して有効なトークンを返す", () => {
  expect(ColumnColor.resolveAccent(undefined, 100)).toMatch(
    FALLBACK_TOKEN_PATTERN,
  );
});

test("負の order でも範囲外にならず有効なトークンを返す", () => {
  expect(ColumnColor.resolveAccent(undefined, -1)).toMatch(
    FALLBACK_TOKEN_PATTERN,
  );
});
