import { expect, test } from "vitest";
import { Priority } from "../index";

test("Priority.OPTIONS は High / Medium / Low の順で固定", () => {
  expect(Priority.OPTIONS).toEqual(["High", "Medium", "Low"]);
});

test("Priority.parse(undefined) は undefined を返す", () => {
  expect(Priority.parse(undefined)).toBeUndefined();
});

test('Priority.parse("") は undefined を返す（HTML select 空値）', () => {
  expect(Priority.parse("")).toBeUndefined();
});

test('Priority.parse("Unknown") は undefined を返す（OPTIONS 外）', () => {
  expect(Priority.parse("Unknown")).toBeUndefined();
});

test('Priority.parse("High") は "High" を返す', () => {
  expect(Priority.parse("High")).toBe("High");
});

test('Priority.parse("Medium") は "Medium" を返す', () => {
  expect(Priority.parse("Medium")).toBe("Medium");
});

test('Priority.parse("Low") は "Low" を返す', () => {
  expect(Priority.parse("Low")).toBe("Low");
});
