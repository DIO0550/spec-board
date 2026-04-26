import { expect, test } from "vitest";
import { Labels } from "../index";

test('Labels.tryAdd([], "x") は ["x"]', () => {
  expect(Labels.tryAdd([], "x")).toEqual(["x"]);
});

test('Labels.tryAdd(["a"], "b") は ["a","b"]', () => {
  expect(Labels.tryAdd(["a"], "b")).toEqual(["a", "b"]);
});

test('Labels.tryAdd(["a"], "a") は null（重複）', () => {
  expect(Labels.tryAdd(["a"], "a")).toBeNull();
});

test('Labels.tryAdd(["a"], "") は null（空文字）', () => {
  expect(Labels.tryAdd(["a"], "")).toBeNull();
});

test('Labels.tryAdd(["a"], "   ") は null（空白のみ）', () => {
  expect(Labels.tryAdd(["a"], "   ")).toBeNull();
});

test('Labels.tryAdd(["a"], "  b  ") は trim して ["a","b"]', () => {
  expect(Labels.tryAdd(["a"], "  b  ")).toEqual(["a", "b"]);
});

test("Labels.tryAdd の戻り値は新しい配列（参照不一致）", () => {
  const current: Labels = ["a"];
  const next = Labels.tryAdd(current, "b");
  expect(next).not.toBe(current);
});

test('Labels.removeFrom(["a","b"], "a") は ["b"]', () => {
  expect(Labels.removeFrom(["a", "b"], "a")).toEqual(["b"]);
});

test('Labels.removeFrom(["a","b"], "x") は ["a","b"]（該当なし）', () => {
  expect(Labels.removeFrom(["a", "b"], "x")).toEqual(["a", "b"]);
});

test("Labels.canAdd は trim+重複判定で正しく分岐", () => {
  expect(Labels.canAdd([], "")).toBe(false);
  expect(Labels.canAdd([], " ")).toBe(false);
  expect(Labels.canAdd(["a"], "a")).toBe(false);
  expect(Labels.canAdd(["a"], "b")).toBe(true);
});
