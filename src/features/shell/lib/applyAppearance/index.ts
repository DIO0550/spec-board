import type { Appearance, ThemeMode } from "../../types";

/** documentElement の data 属性に設定する解決済みの外観値。 */
export type AppearanceDataset = {
  /** 実際に適用する配色（system は解決済み） */
  theme: "light" | "dark";
  /** 表示密度 */
  density: Appearance["density"];
  /** アクセントカラー */
  accent: Appearance["accent"];
};

/**
 * テーマモードを実際の配色（light / dark）へ解決する。
 * `system` のときのみ OS の配色設定を採用する。
 * @param theme - 設定上のテーマモード
 * @param systemPrefersDark - OS がダーク配色を要求しているか
 * @returns 適用する配色
 */
export const resolveThemeMode = (
  theme: ThemeMode,
  systemPrefersDark: boolean,
): "light" | "dark" => {
  if (theme === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return theme;
};

/**
 * 外観設定を documentElement へ適用する data 属性値へ変換する。
 * @param appearance - 外観設定
 * @param systemPrefersDark - OS がダーク配色を要求しているか
 * @returns 解決済みの data 属性値
 */
export const resolveAppearanceDataset = (
  appearance: Appearance,
  systemPrefersDark: boolean,
): AppearanceDataset => {
  return {
    theme: resolveThemeMode(appearance.theme, systemPrefersDark),
    density: appearance.density,
    accent: appearance.accent,
  };
};

/**
 * 解決済みの外観値を documentElement の data 属性へ書き込む（DOM 副作用境界）。
 * @param dataset - 解決済みの外観値
 */
export const applyAppearanceDataset = (dataset: AppearanceDataset): void => {
  const root = document.documentElement;
  root.dataset.theme = dataset.theme;
  root.dataset.density = dataset.density;
  root.dataset.accent = dataset.accent;
};
