import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import { Labels } from "@/features/detail/domains/label";
import { LabelsInput, type LabelsInputState } from "./machine";

/** useLabelsInput の引数 */
export type UseLabelsInputArgs = {
  /** 既存ラベル一覧（重複判定の対象） */
  existingLabels: readonly string[];
  /**
   * ラベル確定時のコールバック。trim 済みのラベル文字列が渡される。
   * @param label - 追加されたラベル
   */
  onCommit: (label: string) => void;
};

/** useLabelsInput の戻り値 */
export type UseLabelsInputResult = {
  /** 現在の state（kind で表示分岐する） */
  state: LabelsInputState;
  /** idle → adding に遷移する */
  startAdding: () => void;
  /**
   * adding 中の入力値を更新する。
   * @param value - 新しい入力値
   */
  setInput: (value: string) => void;
  /** adding 中の入力をキャンセルする（idle 復帰） */
  cancelAdding: () => void;
  /** adding 中の入力を確定する（成功時 onCommit + idle 復帰） */
  confirmAdding: () => void;
  /**
   * input 要素に渡す Enter/Escape ハンドラ。
   * @param e - keydown イベント
   */
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * ラベル入力 UI のための hook。
 * - state machine（machine.ts）に遷移ロジックを委譲（不正遷移時のみ dev で console.warn）
 * - Labels.tryAdd で trim/重複判定を委譲
 * - useRef / useEffect は使用しない（ref フラグ完全撤去）
 *
 * @param args - 既存ラベル + 確定コールバック
 * @returns state と各種ハンドラ
 */
export const useLabelsInput = (
  args: UseLabelsInputArgs,
): UseLabelsInputResult => {
  const { existingLabels, onCommit } = args;
  const [state, setState] = useState<LabelsInputState>({ kind: "idle" });

  const startAdding = useCallback(() => {
    setState((s) => LabelsInput.startAdding(s));
  }, []);

  const setInput = useCallback((value: string) => {
    setState((s) => LabelsInput.setInput(s, { value }));
  }, []);

  const cancelAdding = useCallback(() => {
    setState((s) => LabelsInput.cancel(s));
  }, []);

  const confirmAdding = useCallback(() => {
    if (state.kind !== "adding") return;
    const next = Labels.tryAdd(existingLabels, state.input);
    if (next !== null) {
      const added = next[next.length - 1];
      onCommit(added);
    }
    setState((s) => LabelsInput.confirm(s));
  }, [state, existingLabels, onCommit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        confirmAdding();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelAdding();
      }
    },
    [confirmAdding, cancelAdding],
  );

  return {
    state,
    startAdding,
    setInput,
    cancelAdding,
    confirmAdding,
    handleKeyDown,
  };
};
