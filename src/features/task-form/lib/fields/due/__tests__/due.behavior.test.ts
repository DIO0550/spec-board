import { expect, test } from "vitest";
import { DueField } from "..";

test("initial は空文字（未設定）を返す", () => {
  expect(DueField.initial()).toBe("");
});

test("toParam は有効な YYYY-MM-DD をそのまま返す", () => {
  expect(DueField.toParam("2026-07-01")).toBe("2026-07-01");
});

test("toParam は空文字に対して undefined を返す（due キー省略）", () => {
  expect(DueField.toParam("")).toBe(undefined);
});

test.each([
  ["2026/07/01"],
  ["tomorrow"],
  ["2026-13-40"],
  ["2026-02-29"],
])("toParam は不正フォーマット %j に対して undefined を返す（送信しない）", (input) => {
  expect(DueField.toParam(input)).toBe(undefined);
});
