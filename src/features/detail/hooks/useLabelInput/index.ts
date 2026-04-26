import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import { Labels } from "@/features/detail/domains/label";
import {
  LabelInput,
  type LabelInputState,
} from "@/features/detail/domains/label-input";

/** useLabelInput の引数 */
export type UseLabelInputArgs = {
  /** 既存ラベル一覧（重複判定の対象） */
  existingLabels: readonly string[];
  /**
   * ラベル確定時のコールバック。trim 済みのラベル文字列が渡される。
   * @param label - 追加されたラベル
   */
  onCommit: (label: string) => void;
};

/** useLabelInput の戻り値 */
export type UseLabelInputResult = {
  /** 現在の state（テスト等で参照する。UI は isAdding / inputValue を使う） */
  state: LabelInputState;
  /** 入力 input 要素を表示すべきか（adding なら true） */
  isAdding: boolean;
  /** 入力中の値（adding 以外は ""） */
  inputValue: string;
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
 * - 遷移ロジックは domain（@/features/detail/domains/label-input）に委譲（不正遷移時のみ dev で console.warn）
 * - Labels.tryAdd で trim/重複判定を委譲
 * - useRef / useEffect は使用しない（ref フラグ完全撤去）
 *
 * @param args - 既存ラベル + 確定コールバック
 * @returns state と各種ハンドラ
 */
export const useLabelInput = (args: UseLabelInputArgs): UseLabelInputResult => {
  const { existingLabels, onCommit } = args;
  const [state, setState] = useState<LabelInputState>({ kind: "idle" });

  const startAdding = useCallback(() => {
    setState((s) => LabelInput.startAdding(s));
  }, []);

  const setInput = useCallback((value: string) => {
    setState((s) => LabelInput.setInput(s, { value }));
  }, []);

  const cancelAdding = useCallback(() => {
    setState((s) => LabelInput.cancel(s));
  }, []);

  const confirmAdding = useCallback(() => {
    if (!LabelInput.isAdding(state)) return;
    const next = Labels.tryAdd(existingLabels, state.input);
    if (next !== null) {
      const added = next[next.length - 1];
      onCommit(added);
    }
    setState((s) => LabelInput.confirm(s));
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
    isAdding: LabelInput.isAdding(state),
    inputValue: LabelInput.inputOf(state) ?? "",
    startAdding,
    setInput,
    cancelAdding,
    confirmAdding,
    handleKeyDown,
  };
};
