import { useCallback, useState } from "react";

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

/**
 * App レベルで画面区分（view）を保持するフック。
 * board 状態は呼び出し側（App）が据え置き保持する前提で、本フックは view のみ管理する。
 * @returns view state と単一の navigate ハンドラ
 */
export const useAppView = (): UseAppViewResult => {
  const [view, setView] = useState<AppView>("board");

  // 引数が AppView ユニオンなので未知値はコンパイル時に排除される。そのまま set する。
  const navigate = useCallback((next: AppView) => {
    setView(next);
  }, []);

  return { view, navigate };
};
