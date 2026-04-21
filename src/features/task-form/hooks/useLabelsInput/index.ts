import type { Dispatch, KeyboardEvent } from "react";
import { useCallback, useReducer } from "react";
import {
  type LabelsAction,
  LabelsField,
  type LabelsValue,
} from "@/features/task-form/lib/fields/labels";

/** useLabelsInput の返却値 */
export type UseLabelsInputResult = {
  /** ラベル入力の現在状態 */
  state: LabelsValue;
  /** 状態を変更する dispatch（setInput / commit / remove） */
  dispatch: Dispatch<LabelsAction>;
  /**
   * input の onKeyDown に渡すハンドラ。Enter で commit を dispatch する。
   * @param e - キーボードイベント
   */
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /**
   * submit 時に未コミットラベルを取り込み、最終 labels を同期取得する。
   * state 更新は dispatch で非同期に走るが、戻り値は同期的に確定した配列。
   * @returns 最終ラベル配列
   */
  commitPendingAndGetLabels: () => string[];
};

/**
 * ラベル入力用の state を `useReducer` で管理するカスタムフック。
 * reducer / 初期値 / commit ロジックはすべて `LabelsField`（pure function）に委譲し、
 * ここでは React 配線のみを担う。
 * @param initialLabels - 初期ラベル配列
 * @returns ラベル入力フック結果
 */
export const useLabelsInput = (
  initialLabels: string[] = [],
): UseLabelsInputResult => {
  const [state, dispatch] = useReducer(
    LabelsField.reducer,
    initialLabels,
    LabelsField.initial,
  );

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // IME 変換確定の Enter はラベル確定と区別する。
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      dispatch({ type: "commit" });
    }
  }, []);

  const commitPendingAndGetLabels = useCallback((): string[] => {
    const { next, labels } = LabelsField.commitPendingAndExtract(state);
    if (next !== state) dispatch({ type: "commit" });
    return labels;
  }, [state]);

  return { state, dispatch, handleKeyDown, commitPendingAndGetLabels };
};
