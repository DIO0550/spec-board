/**
 * カラムヘッダーのアクセント色を解決する共有ドメイン companion。
 *
 * config の `columns[].color` は任意フィールドで、不正・欠落時は表示層が
 * フォールバックパレットを適用する。パレットは CSS テーマトークン
 * （`--color-column-accent-*`）ベースで light/dark に追従する。
 */

/**
 * order index → フォールバック色を決定的に写像する CSS テーマトークン配列。
 * `src/index.css` の `@theme` + `[data-theme="dark"]` で light/dark 両値を定義し、
 * `var()` 参照で実行時にテーマへ自動追従する。
 */
const FALLBACK_PALETTE = [
  "var(--color-column-accent-1)",
  "var(--color-column-accent-2)",
  "var(--color-column-accent-3)",
  "var(--color-column-accent-4)",
  "var(--color-column-accent-5)",
  "var(--color-column-accent-6)",
] as const;

/** `#rrggbb`（`#` + 16 進 6 桁）のみ受理する lenient 正規化用パターン。 */
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * `#RRGGBB` 妥当値のみ小文字化して返し、不正値は null を返す。
 * @param raw - 検査対象の色文字列
 * @returns 正規化済み `#rrggbb`、不正なら null
 */
const normalizeHex = (raw: string): string | null => {
  if (!HEX_PATTERN.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
};

/** カラムアクセント色解決の共有ドメイン companion。 */
export const ColumnColor = {
  /**
   * カラムヘッダーのアクセント色を解決する。
   * color が `#RRGGBB` 妥当値なら正規化した小文字 hex を、なければ order index に
   * 対応するフォールバックトークンを返す（order がパレット長を超えても循環する）。
   * @param color - config 由来の色文字列（未指定可）
   * @param orderIndex - カラムの表示順インデックス（フォールバック写像に使う）
   * @returns CSS の `border-top-color` 等に直接渡せる色値（hex か `var(...)` トークン）
   */
  resolveAccent: (color: string | undefined, orderIndex: number): string => {
    const normalized = color !== undefined ? normalizeHex(color) : null;
    if (normalized !== null) {
      return normalized;
    }
    // 負値・非整数の order でも範囲外参照（undefined）にならないよう正規化する。
    const length = FALLBACK_PALETTE.length;
    const paletteIndex = ((Math.trunc(orderIndex) % length) + length) % length;
    return FALLBACK_PALETTE[paletteIndex];
  },
} as const;
