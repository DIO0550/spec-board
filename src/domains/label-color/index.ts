/**
 * ラベル色の raw 入力文字列。`#RRGGBB` 形式を期待するが、
 * 妥当性は保証しない（妥当性は LabelColor.isValid で判定する）。
 */
export type LabelColor = string;

/**
 * `#RRGGBB` のみ妥当とする判定パターン。
 * column-color の私有 regex とは意図的に独立させる（あちらは小文字化を伴う
 * Column 用 lenient 正規化で意味論が異なる）。
 */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** LabelColor の companion API（判定 + 実効値。純粋・同期・throw しない）。 */
export const LabelColor = {
  /**
   * `#RRGGBB` 妥当色かを判定する。
   * @param raw - 判定対象の文字列
   * @returns 妥当な HEX 色なら true
   */
  isValid: (raw: LabelColor): boolean => HEX_COLOR_PATTERN.test(raw),

  /**
   * color 入力の実効値（trim 済み。空なら undefined）。
   * @param raw - フォーム入力の color 文字列
   * @returns trim 済み値、または空の場合は undefined
   */
  effective: (raw: LabelColor): string | undefined => {
    const trimmed = raw.trim();
    return trimmed === "" ? undefined : trimmed;
  },
} as const;
