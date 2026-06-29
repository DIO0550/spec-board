import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * アプリの画面区分。board（既定）/ settings / detail（全画面詳細）/ milestone
 * （マイルストーン別ビュー）/ create（全画面2ペインのタスク作成画面）の 5 区分。
 */
export type AppView = "board" | "settings" | "detail" | "milestone" | "create";

/** useAppView の返り値。view state と単一の遷移ハンドラ。 */
export type UseAppViewResult = {
  /** 現在の画面区分 */
  view: AppView;
  /**
   * 指定した view へ遷移する。引数は AppView ユニオンで型安全。
   * view が増えても API は不変（呼び出し側が行き先を渡す）。
   * @param next - 遷移先の view
   */
  navigate: (next: AppView) => void;
};

// Provider 未提供時を null で表現し、フック側で early throw する規約に揃える。
const AppViewContext = createContext<UseAppViewResult | null>(null);

/** AppViewProvider の Props。 */
type AppViewProviderProps = {
  /** Context を供給する子要素 */
  children: ReactNode;
};

/**
 * アプリの画面区分（view）の Context を配下に供給する Provider。
 * 内部の `useState<AppView>("board")` で view state を所有し、`navigate` は
 * `useCallback` で stable に提供する完全 uncontrolled 形。
 *
 * プロジェクト切替時の view リセットは `<AppViewProvider key={loadedPath}>`
 * で本 Provider を remount することで、内部 useState の初期値 "board" に
 * 自動的に戻る。これにより上位で render-phase setState を行う必要がなくなる。
 *
 * @param props - {@link AppViewProviderProps}
 * @returns Provider 要素
 */
export const AppViewProvider = ({ children }: AppViewProviderProps) => {
  const [view, setView] = useState<AppView>("board");
  const navigate = useCallback((next: AppView) => {
    setView(next);
  }, []);
  const value = useMemo<UseAppViewResult>(
    () => ({ view, navigate }),
    [view, navigate],
  );
  return (
    <AppViewContext.Provider value={value}>{children}</AppViewContext.Provider>
  );
};

/**
 * App レベルの view state と単一の navigate ハンドラを取得するフック。
 * @throws AppViewProvider の外で呼ばれた場合
 * @returns {@link UseAppViewResult}
 */
export const useAppView = (): UseAppViewResult => {
  const context = useContext(AppViewContext);
  if (context === null) {
    throw new Error("useAppView は AppViewProvider の内側で使用してください");
  }
  return context;
};
