import type { Dispatch, KeyboardEvent } from "react";
import { useCallback, useReducer } from "react";
import {
  type LabelsAction,
  LabelsField,
} from "@/features/task-form/lib/fields/labels";

/** useLabelsInput の返却値 */
export type UseLabelsInputResult = {
  /** ラベル入力の現在状態 */
  state: LabelsField;
  /** 状態を変更する dispatch（setInput / commit / remove） */
  dispatch: Dispatch<LabelsAction>;
  /**
   * input の onKeyDown に渡すハンドラ。Enter で commit を dispatch する。
   * @param e - キーボードイベント
   */
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /**
   * submit 用に pending labelInput を取り込んだ最終 labels を同期で返す。
   * hook の state は更新しない（submit 成功で unmount、失敗時は UI を
   * そのまま維持するため、commit の dispatch は行わない）。
   * @returns 最終ラベル配列
   */
  finalizeLabels: () => string[];
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
      // Enter では常に preventDefault する。`<form>` 内の input のため、
      // IME 変換確定の Enter であっても抑止しないとフォーム submit が発火する。
      e.preventDefault();
      // IME 変換確定の Enter はラベル確定と区別し、commit のみスキップする。
      if (e.nativeEvent.isComposing) return;
      dispatch({ type: "commit" });
    }
  }, []);

  const finalizeLabels = useCallback(
    (): string[] => LabelsField.finalize(state),
    [state],
  );

  return { state, dispatch, handleKeyDown, finalizeLabels };
};
