import { expect, test } from "vitest";
import { arrayShallowEq } from "..";

test("同一参照は true を返す", () => {
  const a = ["x", "y"];
  expect(arrayShallowEq(a, a)).toBe(true);
});

test("要素が順序込みで一致すれば true を返す", () => {
  expect(arrayShallowEq(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
});

test("空配列同士は true を返す", () => {
  expect(arrayShallowEq([], [])).toBe(true);
});

test("長さが異なる場合は false を返す", () => {
  expect(arrayShallowEq(["a"], ["a", "b"])).toBe(false);
});

test("同じ要素でも順序が異なる場合は false を返す", () => {
  expect(arrayShallowEq(["a", "b"], ["b", "a"])).toBe(false);
});

test("一部要素が異なる場合は false を返す", () => {
  expect(arrayShallowEq(["a", "b"], ["a", "c"])).toBe(false);
});

test("数値配列でも順序込みで判定する", () => {
  expect(arrayShallowEq([1, 2, 3], [1, 2, 3])).toBe(true);
  expect(arrayShallowEq([1, 2, 3], [3, 2, 1])).toBe(false);
});

test("オブジェクト要素は参照同値で判定される（浅い等値）", () => {
  const o = { id: 1 };
  expect(arrayShallowEq([o], [o])).toBe(true);
  expect(arrayShallowEq([{ id: 1 }], [{ id: 1 }])).toBe(false);
});
