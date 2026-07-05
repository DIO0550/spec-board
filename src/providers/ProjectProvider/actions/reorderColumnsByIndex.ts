import type { Column } from "@/types/column";

/**
 * index が `[0, length)` の範囲に収まる整数であることを判定する。
 *
 * @param index 検査対象の index
 * @param length 配列の長さ
 * @returns 整数かつ範囲内なら true
 */
const isValidIndex = (index: number, length: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < length;

/**
 * 表示順に並んだ columns を fromIndex → toIndex で並び替え、order を 0,1,2,... に完全正規化する。
 *
 * 前提:
 *   - 引数の columns は呼び出し側で order 昇順にソート済み（reorderColumnsByIndex はソートを行わない）
 *
 * @param columns 表示順 (order 昇順) でソート済みの columns
 * @param fromIndex 移動元 index
 * @param toIndex 移動先 index
 * @returns 並び替え後の Column[]（order が 0-origin 連番）。以下の場合は null:
 *   - columns.length < 2
 *   - fromIndex / toIndex が範囲外（負数 / 長さ以上 / 非整数）
 *   - fromIndex === toIndex
 */
export const reorderColumnsByIndex = (
  columns: readonly Column[],
  fromIndex: number,
  toIndex: number,
): readonly Column[] | null => {
  if (columns.length < 2) {
    return null;
  }
  if (!isValidIndex(fromIndex, columns.length)) {
    return null;
  }
  if (!isValidIndex(toIndex, columns.length)) {
    return null;
  }
  if (fromIndex === toIndex) {
    return null;
  }
  const next = [...columns];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((column, order) => ({ ...column, order }));
};
