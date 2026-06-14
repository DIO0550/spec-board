import { expect, test } from "vitest";
import { computePreviewWidth } from "..";

test("中間域では viewportWidth - clientX をそのまま幅とする", () => {
  // viewport 1200, max = round(1200*0.62)=744。clientX 700 → 1200-700=500（範囲内）。
  expect(computePreviewWidth({ clientX: 700, viewportWidth: 1200 })).toBe(500);
});

test("下限 340 未満になる位置では 340 にクランプされる", () => {
  // 1200-1000=200 < 340 → 340。
  expect(computePreviewWidth({ clientX: 1000, viewportWidth: 1200 })).toBe(340);
});

test("上限（round(viewportWidth*0.62)）超で上限にクランプされる", () => {
  // 1200-100=1100 > 744 → 744。
  expect(computePreviewWidth({ clientX: 100, viewportWidth: 1200 })).toBe(744);
});

test("上限は viewportWidth*0.62 を四捨五入した値になる", () => {
  // 1001*0.62 = 620.62 → round 621。clientX 0 → raw 1001 > 621 → 621。
  expect(computePreviewWidth({ clientX: 0, viewportWidth: 1001 })).toBe(621);
});

test("clientX が viewportWidth を超えても下限を割らない", () => {
  expect(computePreviewWidth({ clientX: 5000, viewportWidth: 1200 })).toBe(340);
});
