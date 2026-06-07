import {
  ACCENTS,
  type Accent,
  type Appearance,
  DEFAULT_APPEARANCE,
  DENSITIES,
  type Density,
  THEME_MODES,
  type ThemeMode,
} from "../../types";

/** 外観設定を保存する localStorage キー。 */
export const APPEARANCE_STORAGE_KEY = "spec-board:appearance";

/**
 * 任意の値が指定の許容値配列に含まれるかを判定する型ガード。
 * @param allowed - 許容値の配列
 * @param value - 検査対象
 * @returns value が allowed の要素なら true
 */
const isMember = <T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T => {
  return typeof value === "string" && allowed.includes(value as T);
};

/**
 * 境界入力（永続化値の復元など）を Appearance に正規化する。
 * オブジェクトでない・フィールドが未知値のものはフィールド単位で既定値に落とす。
 * @param value - 任意の入力値
 * @returns 正規化済みの Appearance
 */
export const normalizeAppearance = (value: unknown): Appearance => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_APPEARANCE;
  }
  const record = value as Record<string, unknown>;
  const theme: ThemeMode = isMember(THEME_MODES, record.theme)
    ? record.theme
    : DEFAULT_APPEARANCE.theme;
  const density: Density = isMember(DENSITIES, record.density)
    ? record.density
    : DEFAULT_APPEARANCE.density;
  const accent: Accent = isMember(ACCENTS, record.accent)
    ? record.accent
    : DEFAULT_APPEARANCE.accent;
  return { theme, density, accent };
};

/**
 * localStorage から外観設定を読み込む。未保存・壊れた値は既定値にフォールバックする。
 * @returns 復元した Appearance
 */
export const loadAppearance = (): Appearance => {
  const raw = readRawAppearance();
  if (raw === null) {
    return DEFAULT_APPEARANCE;
  }
  return normalizeAppearance(parseJson(raw));
};

/**
 * 外観設定を localStorage に保存する。
 * @param appearance - 保存する外観設定
 */
export const saveAppearance = (appearance: Appearance): void => {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // localStorage 非対応・容量超過などは UI 設定の永続化失敗として黙殺する
  }
};

/**
 * localStorage から生文字列を読む（I/O 境界。アクセス不可は null 扱い）。
 * @returns 保存文字列、未保存・アクセス不可なら null
 */
const readRawAppearance = (): string | null => {
  try {
    return localStorage.getItem(APPEARANCE_STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * JSON 文字列をパースする。不正な JSON は undefined を返す。
 * @param raw - JSON 文字列
 * @returns パース結果、不正なら undefined
 */
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};
