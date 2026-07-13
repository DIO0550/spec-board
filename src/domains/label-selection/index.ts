/**
 * 選択済みラベルの列（domain 型）。task の labels / field の value の正体。
 * companion `LabelSelection` はこの型に対する操作を束ねる（型 + 同名 const パターン）。
 */
export type LabelSelection = readonly string[];

/**
 * 比較キー正規化: 前後空白除去 + 小文字化（大文字小文字を区別しない照合の単一ソース）。
 * @param s - 正規化する文字列
 * @returns trim + 小文字化した比較キー
 */
const normalize = (s: string): string => s.trim().toLowerCase();

/**
 * ラベル選択に対する操作を束ねる companion。
 * 選択判定・トグル・新規作成可否・候補絞り込みを大文字小文字を区別せず一元化し、
 * UI 層のインライン判定（素の `includes` / `new Set` / トリム）を排除する。
 */
export const LabelSelection = {
  /**
   * 選択済みに name が（大文字小文字を区別せず）含まれるか。
   * ✓ 表示・トグル判定の単一ソース。
   * @param selection - 選択済みラベル
   * @param name - 候補名（表示は master 由来なので case が selection と食い違い得る）
   * @returns 含まれていれば true
   */
  isSelected: (selection: LabelSelection, name: string): boolean => {
    const key = normalize(name);
    return selection.some((s) => normalize(s) === key);
  },

  /**
   * 候補名をトグルした次の選択を返す。
   * 既に大文字小文字を区別せず選択済みなら一致する既存値をすべて除外、未選択なら末尾に追加する。
   * これにより master("Bug") と task("bug") の case 食い違いでも case 重複を生成しない。
   * @param selection - 現在の選択済みラベル
   * @param name - トグル対象の候補名
   * @returns トグル後の選択
   */
  toggle: (selection: LabelSelection, name: string): LabelSelection => {
    const key = normalize(name);
    if (selection.some((s) => normalize(s) === key)) {
      return selection.filter((s) => normalize(s) !== key);
    }
    return [...selection, name];
  },

  /**
   * 新規作成候補を出すべきか判定する。query が非空で、候補にも選択済みにも
   * 大文字小文字を区別しない一致が無いときのみ true。
   * @param selection - 選択済みラベル
   * @param candidates - ラベルマスタ由来の候補名一覧
   * @param query - 検索クエリ（trim 前）
   * @returns 新規作成候補を出すべきなら true
   */
  canCreate: (
    selection: LabelSelection,
    candidates: readonly string[],
    query: string,
  ): boolean => {
    const key = normalize(query);
    if (key === "") {
      return false;
    }
    const inCandidates = candidates.some((n) => normalize(n) === key);
    const inSelected = selection.some((n) => normalize(n) === key);
    return !inCandidates && !inSelected;
  },

  /**
   * 候補名を query で絞り込む（大文字小文字を区別しない部分一致・空 query は全件）。
   * 選択の除外は行わない（多選択トグル UI で ✓ 表示するため）。
   * @param candidates - ラベルマスタ由来の候補名一覧
   * @param query - 検索クエリ（trim 前）
   * @returns 絞り込み後の候補名一覧
   */
  search: (candidates: readonly string[], query: string): string[] => {
    const key = normalize(query);
    if (key === "") {
      return [...candidates];
    }
    return candidates.filter((name) => normalize(name).includes(key));
  },
} as const;
