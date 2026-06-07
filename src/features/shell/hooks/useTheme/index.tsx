import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { loadAppearance, saveAppearance } from "../../lib/appearanceStorage";
import {
  applyAppearanceDataset,
  resolveAppearanceDataset,
  resolveThemeMode,
} from "../../lib/applyAppearance";
import type { Accent, Appearance, Density, ThemeMode } from "../../types";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** useTheme が公開する外観設定 state と更新ハンドラ。 */
export type ThemeContextValue = {
  /** 現在の外観設定 */
  appearance: Appearance;
  /**
   * 実際に適用される配色（`system` は OS 設定を解決済み）。OS 配色の変更にも追従して
   * 更新されるため、実効配色に依存する表示（テーマトグルのアイコン等）はこれを参照する。
   */
  resolvedTheme: "light" | "dark";
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

/** MediaQueryList の変更ハンドラ（引数なし）。 */
type MediaQueryChangeListener = () => void;

/** 購読を解除する関数。 */
type Unsubscribe = () => void;

/**
 * MediaQueryList の変更を購読する。`addEventListener` が未実装の環境
 * （古い WebKit / WKWebView）では deprecated な `addListener` にフォールバックする。
 * @param mediaQuery - 購読対象の MediaQueryList
 * @param listener - 変更時に呼ぶハンドラ
 * @returns 購読解除関数
 */
const subscribeMediaQuery = (
  mediaQuery: MediaQueryList,
  listener: MediaQueryChangeListener,
): Unsubscribe => {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }
  // 古い WebKit / WKWebView 向けフォールバック（非推奨 API だが互換のため使用）。
  mediaQuery.addListener(listener);
  return () => {
    mediaQuery.removeListener(listener);
  };
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
  // OS 配色（ダークか）を state として保持する。これにより system テーマ選択中の
  // OS 配色変更で context 値が変わり、実効配色に依存する consumer も再描画される。
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  // 外観設定 / OS 配色が変わるたびに永続化と documentElement への反映を行う。
  // 初回ペイント前に dataset を適用して FOUC（一瞬ライト表示）を抑えるため
  // useLayoutEffect を使う（保存は副作用として同居させる）。
  useLayoutEffect(() => {
    saveAppearance(appearance);
    applyAppearanceDataset(resolveAppearanceDataset(appearance, systemDark));
  }, [appearance, systemDark]);

  // system テーマ選択中のみ OS 配色の変更を購読し、systemDark state を更新する。
  useEffect(() => {
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
    // 購読開始時点の値で同期しておく（light↔system 往復で取りこぼさないため）。
    setSystemDark(mediaQuery.matches);
    return subscribeMediaQuery(mediaQuery, () => {
      setSystemDark(mediaQuery.matches);
    });
  }, [appearance.theme]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setAppearance((prev) => ({ ...prev, theme }));
  }, []);
  const setDensity = useCallback((density: Density) => {
    setAppearance((prev) => ({ ...prev, density }));
  }, []);
  const setAccent = useCallback((accent: Accent) => {
    setAppearance((prev) => ({ ...prev, accent }));
  }, []);

  const resolvedTheme = resolveThemeMode(appearance.theme, systemDark);

  const value = useMemo<ThemeContextValue>(
    () => ({ appearance, resolvedTheme, setTheme, setDensity, setAccent }),
    [appearance, resolvedTheme, setTheme, setDensity, setAccent],
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
