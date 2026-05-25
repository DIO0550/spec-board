/**
 * 配列の浅い等値判定（順序込みの要素一致）。
 *
 * 同一参照、または長さが等しく要素が順序込みで `===` 一致する場合に `true` を返す。
 * 楽観 dispatch の rollback 判定など、配列の同一性を素早く確認したい場面で用いる。
 *
 * @param a 比較対象の配列 1
 * @param b 比較対象の配列 2
 * @returns 同一参照または要素が順序込みで一致すれば true
 */
export const arrayShallowEq = <T>(
  a: readonly T[],
  b: readonly T[],
): boolean => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((v, i) => v === b[i]);
};
