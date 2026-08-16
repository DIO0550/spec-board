import { expect, test } from "vitest";
import { LabelColor } from "../index";

test("isValid は妥当な #RRGGBB を true にする", () => {
  expect(LabelColor.isValid("#7860b5")).toBe(true);
  expect(LabelColor.isValid("#AABBCC")).toBe(true);
});

test("isValid は不正な値を false にする", () => {
  expect(LabelColor.isValid("#12")).toBe(false);
  expect(LabelColor.isValid("red")).toBe(false);
  expect(LabelColor.isValid("")).toBe(false);
  expect(LabelColor.isValid("#7860b")).toBe(false);
  expect(LabelColor.isValid("7860b5")).toBe(false);
});

test.each([
  ["暗い背景", "#1f2937", "#ffffff"],
  ["白文字と黒文字の境界より暗い背景", "#666666", "#ffffff"],
  ["白文字と黒文字の境界より明るい背景", "#777777", "#000000"],
  ["明るい背景", "#fbbf24", "#000000"],
])("contrastForeground は%sに高いコントラストの文字色を返す", (_label, background, expected) => {
  expect(LabelColor.contrastForeground(background)).toBe(expected);
});

test("contrastForeground は不正な色では既存表示と同じ黒文字へフォールバックする", () => {
  expect(LabelColor.contrastForeground("#not-a-hex")).toBe("#000000");
});

test("isValid は小文字化しない（大文字 HEX をそのまま判定）", () => {
  expect(LabelColor.isValid("#AABBCC")).toBe(true);
});

test("effective は前後空白を trim する", () => {
  expect(LabelColor.effective("#7860b5 ")).toBe("#7860b5");
  expect(LabelColor.effective(" #AABBCC ")).toBe("#AABBCC");
});

test("effective は空文字で undefined を返す", () => {
  expect(LabelColor.effective("")).toBeUndefined();
});

test("effective は空白のみで undefined を返す", () => {
  expect(LabelColor.effective("   ")).toBeUndefined();
});

test("effective は大文字 HEX を大文字のまま返す", () => {
  expect(LabelColor.effective("#AABBCC")).toBe("#AABBCC");
});
