import { beforeEach, expect, test } from "vitest";
import { DEFAULT_APPEARANCE } from "../../../types";
import {
  APPEARANCE_STORAGE_KEY,
  loadAppearance,
  normalizeAppearance,
  saveAppearance,
} from "..";

beforeEach(() => {
  localStorage.clear();
});

test("正常系: 全フィールドが有効な値ならそのまま採用する", () => {
  const result = normalizeAppearance({
    theme: "dark",
    density: "compact",
    accent: "violet",
  });

  expect(result).toEqual({
    theme: "dark",
    density: "compact",
    accent: "violet",
  });
});

test.each([
  ["null", null],
  ["undefined", undefined],
  ["文字列", "dark"],
  ["数値", 42],
  ["配列", []],
])("異常系: オブジェクトでない入力（%s）は既定値に落ちる", (_label, input) => {
  expect(normalizeAppearance(input)).toEqual(DEFAULT_APPEARANCE);
});

test.each([
  ["theme", { theme: "neon" }],
  ["density", { density: "spacious" }],
  ["accent", { accent: "teal" }],
])("異常系: 未知の %s 値は該当フィールドのみ既定値に落ちる", (field, input) => {
  const result = normalizeAppearance(input);
  expect(result[field as keyof typeof result]).toBe(
    DEFAULT_APPEARANCE[field as keyof typeof DEFAULT_APPEARANCE],
  );
});

test("境界値: 一部フィールドのみ有効なとき欠落分は既定値で補う", () => {
  const result = normalizeAppearance({ theme: "light" });

  expect(result).toEqual({
    theme: "light",
    density: DEFAULT_APPEARANCE.density,
    accent: DEFAULT_APPEARANCE.accent,
  });
});

test("正常系: saveAppearance で保存した値を loadAppearance で復元できる", () => {
  saveAppearance({ theme: "dark", density: "compact", accent: "green" });

  expect(loadAppearance()).toEqual({
    theme: "dark",
    density: "compact",
    accent: "green",
  });
});

test("異常系: 未保存なら loadAppearance は既定値を返す", () => {
  expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
});

test("異常系: 壊れた JSON が保存されていても loadAppearance は既定値を返す", () => {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, "{not-json");

  expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
});
