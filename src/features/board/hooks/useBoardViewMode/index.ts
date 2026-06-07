import { useCallback, useState } from "react";

/** ボードの表示形態一覧（サブバータブと検証の両方に使う）。 */
export const BOARD_VIEW_MODES = ["board", "list", "tree", "calendar"] as const;
/** ボードの表示形態。 */
export type BoardViewMode = (typeof BOARD_VIEW_MODES)[number];

/** 表示形態を保存する localStorage キー。 */
const STORAGE_KEY = "spec-board:viewMode";

/**
 * 境界入力（永続化値の復元）を BoardViewMode に正規化する。未知値は "board"。
 * @param value - 任意の文字列
 * @returns 正規化済みの BoardViewMode
 */
export const normalizeBoardViewMode = (value: string | null): BoardViewMode => {
  if (
    value !== null &&
    (BOARD_VIEW_MODES as readonly string[]).includes(value)
  ) {
    return value as BoardViewMode;
  }
  return "board";
};

/**
 * localStorage から表示形態を読み込む（アクセス不可は "board"）。
 * @returns 復元した BoardViewMode
 */
const loadViewMode = (): BoardViewMode => {
  try {
    return normalizeBoardViewMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "board";
  }
};

/** useBoardViewMode の返り値。 */
export type UseBoardViewModeResult = {
  /** 現在の表示形態 */
  viewMode: BoardViewMode;
  /**
   * 表示形態を切り替える（localStorage へ永続化する）。
   * @param next - 新しい表示形態
   */
  setViewMode: (next: BoardViewMode) => void;
};

/**
 * ボードの表示形態（board / list / tree / calendar）を保持し localStorage に永続化する。
 * @returns 表示形態 state と更新ハンドラ
 */
export const useBoardViewMode = (): UseBoardViewModeResult => {
  const [viewMode, setViewModeState] = useState<BoardViewMode>(loadViewMode);

  const setViewMode = useCallback((next: BoardViewMode) => {
    setViewModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage 非対応・容量超過などは UI 設定の永続化失敗として黙殺する
    }
  }, []);

  return { viewMode, setViewMode };
};
