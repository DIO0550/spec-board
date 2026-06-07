/**
 * 外観（テーマ / 密度 / アクセント）設定。アプリのクライアントローカル UI 設定であり、
 * プロジェクトの `.spec-board/config.json` には保存しない（localStorage に永続化する）。
 */

/** テーマモード一覧（検証・UI 選択肢の両方に使う）。 */
export const THEME_MODES = ["light", "dark", "system"] as const;
/** テーマモード。`system` は OS の配色設定に追従する。 */
export type ThemeMode = (typeof THEME_MODES)[number];

/** 表示密度一覧。 */
export const DENSITIES = ["comfortable", "compact"] as const;
/** 表示密度。`compact` は余白とフォントを一段詰める。 */
export type Density = (typeof DENSITIES)[number];

/** アクセントカラー一覧。 */
export const ACCENTS = ["blue", "violet", "green", "amber", "rose"] as const;
/** アクセントカラー（主要操作・アクティブ表現の差し色）。 */
export type Accent = (typeof ACCENTS)[number];

/** 外観設定のまとまり。 */
export type Appearance = {
  /** テーマモード */
  theme: ThemeMode;
  /** 表示密度 */
  density: Density;
  /** アクセントカラー */
  accent: Accent;
};

/** 未設定・不正値のフォールバックに使う既定の外観設定。 */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  density: "comfortable",
  accent: "blue",
};
