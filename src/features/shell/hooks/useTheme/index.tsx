import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { loadAppearance, saveAppearance } from "../../lib/appearanceStorage";
import {
  applyAppearanceDataset,
  resolveAppearanceDataset,
} from "../../lib/applyAppearance";
import type { Accent, Appearance, Density, ThemeMode } from "../../types";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** useTheme が公開する外観設定 state と更新ハンドラ。 */
export type ThemeContextValue = {
  /** 現在の外観設定 */
  appearance: Appearance;
  /**
   * テーマモードを変更する。
   * @param theme - 新しいテーマモード
   */
  setTheme: (theme: ThemeMode) => void;
  /**
   * 表示密度を変更する。
   * @param density - 新しい表示密度
   */
  setDensity: (density: Density) => void;
  /**
   * アクセントカラーを変更する。
   * @param accent - 新しいアクセントカラー
   */
  setAccent: (accent: Accent) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * OS がダーク配色を要求しているかを判定する（matchMedia 非対応環境では false）。
 * @returns OS がダーク配色なら true
 */
const prefersDark = (): boolean => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
};

/** ThemeProvider の Props。 */
type ThemeProviderProps = {
  /** 配下に外観設定を供給する子要素 */
  children: ReactNode;
};

/**
 * 外観設定（テーマ / 密度 / アクセント）を保持し、localStorage への永続化と
 * documentElement への data 属性反映を行う Provider。`system` テーマ選択中は
 * OS 配色の変更にも追従する。
 * @param props - {@link ThemeProviderProps}
 * @returns Provider 要素
 */
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);

  useEffect(() => {
    saveAppearance(appearance);
    const apply = () => {
      applyAppearanceDataset(
        resolveAppearanceDataset(appearance, prefersDark()),
      );
    };
    apply();
    if (appearance.theme !== "system") {
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    mediaQuery.addEventListener("change", apply);
    return () => {
      mediaQuery.removeEventListener("change", apply);
    };
  }, [appearance]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setAppearance((prev) => ({ ...prev, theme }));
  }, []);
  const setDensity = useCallback((density: Density) => {
    setAppearance((prev) => ({ ...prev, density }));
  }, []);
  const setAccent = useCallback((accent: Accent) => {
    setAppearance((prev) => ({ ...prev, accent }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ appearance, setTheme, setDensity, setAccent }),
    [appearance, setTheme, setDensity, setAccent],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

/**
 * 外観設定 state と更新ハンドラを取得するフック。
 * @throws ThemeProvider の外で呼ばれた場合
 * @returns {@link ThemeContextValue}
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme は ThemeProvider の内側で使用してください");
  }
  return context;
};
