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
 * 型を持たない文字列（永続化値の復元・ディープリンク等の境界入力）を
 * AppView に正規化する。未知値は "board" にフォールバックする。
 * 内部の型付き遷移では使わず、生文字列を navigate に渡す前段で使う。
 * @param candidate - 任意の文字列
 * @returns AppView（不一致は "board"）
 */
export const normalizeAppView = (candidate: string): AppView => {
  if (candidate === "settings") {
    return "settings";
  }
  if (candidate === "detail") {
    return "detail";
  }
  if (candidate === "milestone") {
    return "milestone";
  }
  if (candidate === "create") {
    return "create";
  }
  return "board";
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
