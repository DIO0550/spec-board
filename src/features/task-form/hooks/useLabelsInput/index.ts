import type { Dispatch, KeyboardEvent } from "react";
import { useCallback, useReducer } from "react";
import { LabelsField } from "@/features/task-form/lib/fields/labels";

/**
 * useLabelsInput の dispatch が受け付ける action。
 * React 固有の discriminated union で、domain（LabelsField）とは切り離す。
 */
export type LabelsAction =
  | { type: "setInput"; value: string }
  | { type: "commit" }
  | { type: "remove"; label: string };

/**
 * `useReducer` 用のローカル reducer。domain の pure ops にディスパッチするだけ。
 * @param state - 現在の状態
 * @param action - 操作
 * @returns 新しい状態
 */
const reducer = (state: LabelsField, action: LabelsAction): LabelsField => {
  switch (action.type) {
    case "setInput":
      return LabelsField.withInput(state, action.value);
    case "commit":
      return LabelsField.commit(state);
    case "remove":
      return LabelsField.remove(state, action.label);
    default: {
      action satisfies never;
      return state;
    }
  }
};

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
   * 併せて UI 整合のために `commit` を dispatch するが、返り値は dispatch の
   * 反映を待たずに pure 関数で計算した値を即座に返す（同期待ち不要）。
   * @returns 最終ラベル配列
   */
  finalizeLabels: () => string[];
};

/**
 * ラベル入力用の state を `useReducer` で管理するカスタムフック。
 * 状態遷移のドメインロジックは `LabelsField` の pure ops に委譲し、ここでは
 * React の reducer 配線と handleKeyDown / finalizeLabels のユーティリティだけを担う。
 * @param initialLabels - 初期ラベル配列
 * @returns ラベル入力フック結果
 */
export const useLabelsInput = (
  initialLabels: string[] = [],
): UseLabelsInputResult => {
  const [state, dispatch] = useReducer(
    reducer,
    initialLabels,
    LabelsField.initial,
  );

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Enter では常に preventDefault する。`<form>` 内の input のため、
      // IME 変換確定の Enter であっても抑止しないとフォーム submit が発火する。
      e.preventDefault();
      // IME 変換確定の Enter はラベル確定と区別し、commit のみスキップする。
      if (e.nativeEvent.isComposing) {
        return;
      }
      dispatch({ type: "commit" });
    }
  }, []);

  const finalizeLabels = useCallback((): string[] => {
    const labels = LabelsField.finalize(state);
    // UI 整合のために commit を dispatch する（fire-and-forget）。
    // 返り値は pure 関数で同期計算済みのため dispatch の反映は待たない。
    dispatch({ type: "commit" });
    return labels;
  }, [state]);

  return { state, dispatch, handleKeyDown, finalizeLabels };
};
