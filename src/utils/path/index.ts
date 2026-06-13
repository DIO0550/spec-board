/**
 * パスの末尾セグメント（フォルダ名 / ファイル名）を取り出す。
 * 区切りは `/` と `\` の両方を許容し、末尾の区切りや連続した区切りは無視する。
 *
 * @param path - 任意のパス文字列（POSIX / Windows どちらの区切りでも可）
 * @returns 末尾セグメント。空にならなければそれを、取り出せなければパス全体を返す
 */
export const basenameOf = (path: string): string => {
  const segments = path.split(/[\\/]+/).filter((segment) => segment !== "");
  return segments[segments.length - 1] ?? path;
};
