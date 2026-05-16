import type { DragCardRect } from "@/types/dragCardRect";

/**
 * dragover 時、マウス Y 座標と各カードの bounding rect の中央を比較して、
 * 挿入インデックス (0..rects.length) を返す。
 *
 * - 空配列: 0
 * - clientY が最初のカードの中央より厳密に上: 0
 * - clientY が最後のカードの中央以上: rects.length
 * - 判定式: `clientY < middle` なら index、`>= middle` は次の境界へ進む
 *   （中央ピッタリは「下半分」扱い）
 *
 * @param rects 各カードの top/bottom 座標
 * @param clientY マウス Y 座標
 * @returns 挿入位置（0..rects.length）
 */
export const computeHoverIndex = (
  rects: readonly DragCardRect[],
  clientY: number,
): number => {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (clientY < (rect.top + rect.bottom) / 2) {
      return i;
    }
  }
  return rects.length;
};
