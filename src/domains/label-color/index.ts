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

type Rgb = readonly [red: number, green: number, blue: number];
type ContrastForeground = "#000000" | "#ffffff";

const BLACK_FOREGROUND: ContrastForeground = "#000000";
const WHITE_FOREGROUND: ContrastForeground = "#ffffff";

/**
 * 妥当な HEX 色を sRGB の 0〜255 チャンネルへ変換する。
 * @param raw - 変換対象の色
 * @returns RGB チャンネル、または不正な色なら undefined
 */
const parseHexRgb = (raw: string): Rgb | undefined => {
  if (!HEX_COLOR_PATTERN.test(raw)) {
    return undefined;
  }
  return [
    Number.parseInt(raw.slice(1, 3), 16),
    Number.parseInt(raw.slice(3, 5), 16),
    Number.parseInt(raw.slice(5, 7), 16),
  ];
};

/**
 * sRGB チャンネルを相対輝度計算用の線形値へ変換する。
 * @param channel - 0〜255 の sRGB チャンネル
 * @returns 0〜1 の線形チャンネル
 */
const toLinearChannel = (channel: number): number => {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
};

/**
 * WCAG の定義に基づく sRGB 色の相対輝度を返す。
 * @param rgb - sRGB チャンネル
 * @returns 0〜1 の相対輝度
 */
const relativeLuminance = ([red, green, blue]: Rgb): number =>
  0.2126 * toLinearChannel(red) +
  0.7152 * toLinearChannel(green) +
  0.0722 * toLinearChannel(blue);

/**
 * 2 色の相対輝度からコントラスト比を返す。
 * @param first - 1 色目の相対輝度
 * @param second - 2 色目の相対輝度
 * @returns 1〜21 のコントラスト比
 */
const contrastRatio = (first: number, second: number): number => {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

/** LabelColor の companion API（判定 + 実効値。純粋・同期・throw しない）。 */
export const LabelColor = {
  /**
   * `#RRGGBB` 妥当色かを判定する。
   * @param raw - 判定対象の文字列
   * @returns 妥当な HEX 色なら true
   */
  isValid: (raw: LabelColor): boolean => HEX_COLOR_PATTERN.test(raw),

  /**
   * 背景色に対して白・黒のうちコントラスト比が高い文字色を返す。
   * 白文字と黒文字のコントラスト比を直接比較するため、固定の明度閾値に
   * 依存せず、結果として境界付近ではより読みやすい側を選択する。不正な
   * 色は既存表示との互換性を保つため黒文字へフォールバックする。
   * @param background - 背景色（#RRGGBB）
   * @returns 選択した文字色（#000000 または #ffffff）
   */
  contrastForeground: (background: LabelColor): ContrastForeground => {
    const rgb = parseHexRgb(background);
    if (rgb === undefined) {
      return BLACK_FOREGROUND;
    }
    const luminance = relativeLuminance(rgb);
    const whiteContrast = contrastRatio(1, luminance);
    const blackContrast = contrastRatio(0, luminance);
    return whiteContrast > blackContrast ? WHITE_FOREGROUND : BLACK_FOREGROUND;
  },

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
