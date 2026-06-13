import { expect, test } from "vitest";
import { basenameOf } from "..";

test.each([
  ["/home/user/my-project", "my-project"],
  ["/home/user/my-project/", "my-project"],
  ["C:\\Users\\me\\proj", "proj"],
  ["single", "single"],
  ["/home//user///proj", "proj"],
  ["", ""],
])("basenameOf(%s) は末尾セグメントを返す", (input, expected) => {
  expect(basenameOf(input)).toBe(expected);
});
