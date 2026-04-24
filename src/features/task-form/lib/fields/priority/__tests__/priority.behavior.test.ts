import { expect, test } from "vitest";
import { PriorityField } from "..";

test("initial は空文字を返す", () => {
  expect(PriorityField.initial()).toBe("");
});

test("normalize: 空文字は undefined", () => {
  expect(PriorityField.normalize("")).toBeUndefined();
});

test("normalize: High はそのまま", () => {
  expect(PriorityField.normalize("High")).toBe("High");
});

test("normalize: Medium はそのまま", () => {
  expect(PriorityField.normalize("Medium")).toBe("Medium");
});

test("normalize: Low はそのまま", () => {
  expect(PriorityField.normalize("Low")).toBe("Low");
});
