import { expect, test } from "vitest";
import { type CardRect, computeHoverIndex } from "../dragHover";

const rect = (top: number, bottom: number): CardRect => ({ top, bottom });

test("空配列なら 0 を返す", () => {
  expect(computeHoverIndex([], 100)).toBe(0);
});

test("clientY が最初のカードの中央より上なら 0", () => {
  const rects = [rect(0, 40), rect(40, 80)];
  expect(computeHoverIndex(rects, 10)).toBe(0);
});

test("clientY が最後のカードの中央以上なら length", () => {
  const rects = [rect(0, 40), rect(40, 80)];
  expect(computeHoverIndex(rects, 100)).toBe(rects.length);
});

test("単一カードで中央ピッタリなら length（下半分扱い）", () => {
  const rects = [rect(0, 40)];
  expect(computeHoverIndex(rects, 20)).toBe(1);
});

test("3 件の中央カード上半分なら index=1", () => {
  const rects = [rect(0, 40), rect(40, 80), rect(80, 120)];
  expect(computeHoverIndex(rects, 50)).toBe(1);
});

test("3 件の中央カード下半分なら index=2", () => {
  const rects = [rect(0, 40), rect(40, 80), rect(80, 120)];
  expect(computeHoverIndex(rects, 70)).toBe(2);
});

test("3 件の中央カード中央ピッタリなら index=2（下半分扱い）", () => {
  const rects = [rect(0, 40), rect(40, 80), rect(80, 120)];
  expect(computeHoverIndex(rects, 60)).toBe(2);
});
