/**
 * ラベルを追加候補に取り込む際の判定結果（discriminated union）。
 * trim 後の文字列を基準に「空 / 重複 / 追加可」を区別する。
 * - `empty`: trim 後が空文字。追加候補にならない
 * - `duplicate`: trim 後の値が既存ラベルに含まれる
 * - `added`: 追加できる新規ラベル（`value` は trim 済み）
 */
export type LabelAddDecision =
  | { kind: "empty" }
  | { kind: "duplicate"; value: string }
  | { kind: "added"; value: string };

/**
 * ラベル追加の判定ルール companion。
 * 「trim 後空なら拒否・既存に含まれるなら重複・それ以外は追加可」という
 * 単一ルールを集約し、state 形状の異なる各 feature から委譲して使う。
 */
export const LabelAddRule = {
  /**
   * 入力をトリムし、既存ラベルに対して追加可否を分類する。
   * 比較は完全一致（trim 済みの値同士）で行う。
   *
   * @param current - 既存ラベル一覧
   * @param input - 追加候補の文字列（trim 前）
   * @returns 判定結果。`added` の場合 `value` は trim 済みの新規ラベル
   */
  classify: (current: readonly string[], input: string): LabelAddDecision => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return { kind: "empty" };
    }
    if (current.includes(trimmed)) {
      return { kind: "duplicate", value: trimmed };
    }
    return { kind: "added", value: trimmed };
  },
} as const;
