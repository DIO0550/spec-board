/** ラベル一覧（不変） */
export type Labels = readonly string[];

/**
 * ラベルドメインの companion。
 * trim / 重複判定などの純粋関数群を提供する。
 */
export const Labels = {
  /**
   * 入力をトリムして追加可能なら新しい配列を返す。空文字・空白のみ・重複は null。
   * @param current - 現在のラベル一覧
   * @param input - 追加候補の文字列（trim 前）
   * @returns 追加成功時は新しい配列、追加不可なら null
   */
  tryAdd: (current: Labels, input: string): Labels | null => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (current.includes(trimmed)) {
      return null;
    }
    return [...current, trimmed];
  },

  /**
   * 指定ラベルを除外した新しい配列を返す。
   * @param current - 現在のラベル一覧
   * @param target - 除外するラベル名
   * @returns 除外後のラベル一覧
   */
  removeFrom: (current: Labels, target: string): Labels =>
    current.filter((l) => l !== target),

  /**
   * 入力が追加可能かを判定する（tryAdd の戻り値が null でないかと等価）。
   * @param current - 現在のラベル一覧
   * @param input - 追加候補の文字列（trim 前）
   * @returns 追加可能なら true
   */
  canAdd: (current: Labels, input: string): boolean =>
    Labels.tryAdd(current, input) !== null,
} as const;
