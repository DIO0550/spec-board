import { expect, test } from "vitest";
import type { Column } from "@/types/column";
import { reorderColumnsByIndex } from "../reorderColumnsByIndex";

const cols = (...names: readonly string[]): readonly Column[] =>
  names.map((name, order) => ({ name, order }));

test("先頭→末尾の並び替えで 0-origin order に再採番される", () => {
  const before = cols("A", "B", "C");
  expect(reorderColumnsByIndex(before, 0, 2)).toEqual([
    { name: "B", order: 0 },
    { name: "C", order: 1 },
    { name: "A", order: 2 },
  ]);
});

test("末尾→先頭の並び替えで 0-origin order に再採番される", () => {
  const before = cols("A", "B", "C");
  expect(reorderColumnsByIndex(before, 2, 0)).toEqual([
    { name: "C", order: 0 },
    { name: "A", order: 1 },
    { name: "B", order: 2 },
  ]);
});

test("fromIndex === toIndex は null（no-op）", () => {
  expect(reorderColumnsByIndex(cols("A", "B", "C"), 1, 1)).toBeNull();
});

test("columns が 1 件のときは任意の index で null", () => {
  expect(reorderColumnsByIndex(cols("A"), 0, 0)).toBeNull();
});

test.each([
  ["fromIndex 負数", -1, 2],
  ["fromIndex が長さ以上", 3, 0],
  ["fromIndex が非整数", 0.5, 2],
])("fromIndex 範囲外 (%s) は null", (_label, from, to) => {
  expect(reorderColumnsByIndex(cols("A", "B", "C"), from, to)).toBeNull();
});

test.each([
  ["toIndex 負数", 0, -1],
  ["toIndex が長さ以上", 0, 3],
  ["toIndex が非整数", 0, 2.5],
])("toIndex 範囲外 (%s) は null", (_label, from, to) => {
  expect(reorderColumnsByIndex(cols("A", "B", "C"), from, to)).toBeNull();
});

test("gap がある order でも 0-origin 連番に完全正規化される", () => {
  const before: readonly Column[] = [
    { name: "A", order: 0 },
    { name: "B", order: 5 },
    { name: "C", order: 10 },
  ];
  expect(reorderColumnsByIndex(before, 0, 2)).toEqual([
    { name: "B", order: 0 },
    { name: "C", order: 1 },
    { name: "A", order: 2 },
  ]);
});

test("color を持つカラムを並び替えても color が脱落しない", () => {
  const before: readonly Column[] = [
    { name: "A", order: 0, color: "#111111" },
    { name: "B", order: 1, color: "#222222" },
    { name: "C", order: 2 },
  ];
  expect(reorderColumnsByIndex(before, 0, 2)).toEqual([
    { name: "B", order: 0, color: "#222222" },
    { name: "C", order: 1 },
    { name: "A", order: 2, color: "#111111" },
  ]);
});
