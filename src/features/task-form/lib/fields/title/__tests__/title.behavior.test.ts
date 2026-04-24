import { expect, test } from "vitest";
import { TitleField } from "..";

test("initial は空文字を返す", () => {
  expect(TitleField.initial()).toBe("");
});

test("validate: 空文字でエラー", () => {
  expect(TitleField.validate("")).toBe("タイトルを入力してください");
});

test("validate: 空白のみでエラー（trim 判定）", () => {
  expect(TitleField.validate("   ")).toBe("タイトルを入力してください");
});

test("validate: 非空文字で undefined", () => {
  expect(TitleField.validate("abc")).toBeUndefined();
});

test("normalize: 前後空白を trim する", () => {
  expect(TitleField.normalize("  x  ")).toBe("x");
});
