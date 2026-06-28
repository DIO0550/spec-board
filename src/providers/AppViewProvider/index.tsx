import { createContext, type ReactNode, useContext } from "react";

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
  /**
   * 配下に供給する view state と navigate ハンドラ。
   * 上位コンポーネント（AppShell 等）が useState で所有し、value として渡す前提。
   */
  value: UseAppViewResult;
  /** Context を供給する子要素 */
  children: ReactNode;
};

/**
 * アプリの画面区分（view）の Context を配下に供給する Provider。
 * 自身は state を所有せず、上位コンポーネントから渡された value を
 * AppViewContext に流すだけの薄いラッパとして振る舞う。
 *
 * state 所有を呼び出し側に残すのは、render-phase での `navigate("board")` を
 * React 公式の「Adjusting state when a prop changes」パターンとして合法に保つため。
 * navigate を呼ぶコンポーネントと state 所有元を同一に保たないと
 * 「別コンポーネントの state を render 中に更新する」警告に抵触する。
 *
 * @param props - {@link AppViewProviderProps}
 * @returns Provider 要素
 */
export const AppViewProvider = ({ value, children }: AppViewProviderProps) => {
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
