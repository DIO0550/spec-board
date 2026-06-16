/** ラベル設定フォームのカラープリセット 1 件。 */
export type LabelColorPreset = {
  /** プリセット表示名 */
  name: string;
  /** `#RRGGBB` 値 */
  hex: string;
};

/**
 * ラベル設定フォームに並べる HEX プリセット 10 色（モック準拠）。
 * label-registry の oklch グループ色とは別概念（混ぜない）。
 */
export const LABEL_COLOR_PRESETS: readonly LabelColorPreset[] = [
  { name: "red", hex: "#d55753" },
  { name: "orange", hex: "#d27830" },
  { name: "yellow", hex: "#c4a032" },
  { name: "green", hex: "#14874e" },
  { name: "teal", hex: "#008e8e" },
  { name: "blue", hex: "#007bb2" },
  { name: "indigo", hex: "#466abf" },
  { name: "purple", hex: "#7860b5" },
  { name: "pink", hex: "#bf5ea2" },
  { name: "gray", hex: "#79818d" },
] as const;
