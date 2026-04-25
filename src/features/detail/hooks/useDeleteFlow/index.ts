import { useCallback, useState } from "react";
import { DeleteFlow, type DeleteFlowState } from "./machine";

/** useDeleteFlow の引数 */
export type UseDeleteFlowArgs = {
  /**
   * 削除実行時のコールバック。同期/非同期のどちらでも可。
   * @returns void または Promise<void>
   */
  onDelete: () => void | Promise<void>;
};

/** useDeleteFlow の戻り値 */
export type UseDeleteFlowResult = {
  /** 現在の state（kind で UI 表示分岐する） */
  state: DeleteFlowState;
  /** 削除確認ダイアログを開く（idle → confirming） */
  requestDelete: () => void;
  /** 確認をキャンセルする（confirming/error → idle、deleting 中は no-op） */
  cancelDelete: () => void;
  /** 削除を実行する（confirming/error → deleting → idle/error） */
  confirmDelete: () => Promise<void>;
};

/**
 * 削除フロー（idle → confirming → deleting → idle/error）の hook。
 * - state machine（machine.ts）に遷移ロジックを委譲（dev では不正遷移時に machine 側で console.warn）
 * - useRef / useEffect は使用しない（ref フラグ完全撤去）
 * - 冪等性は (1) UI 側 confirmDisabled / cancelDisabled の disabled、
 *   (2) state machine の no-op 遷移、(3) `confirmDelete` 冒頭の
 *   `state.kind` による事前ガード、の三段で担保する
 *
 * @param args - 削除実行コールバック
 * @returns state + 操作ハンドラ
 */
export const useDeleteFlow = (args: UseDeleteFlowArgs): UseDeleteFlowResult => {
  const { onDelete } = args;
  const [state, setState] = useState<DeleteFlowState>({ kind: "idle" });

  const requestDelete = useCallback(() => {
    setState((s) => DeleteFlow.request(s));
  }, []);

  const cancelDelete = useCallback(() => {
    setState((s) => DeleteFlow.cancel(s));
  }, []);

  const confirmDelete = useCallback(async () => {
    if (state.kind !== "confirming" && state.kind !== "error") return;
    setState((s) => DeleteFlow.confirm(s));
    try {
      await onDelete();
      setState((s) => DeleteFlow.succeed(s));
    } catch (reason) {
      setState((s) => DeleteFlow.fail(s, { reason }));
    }
  }, [state.kind, onDelete]);

  return { state, requestDelete, cancelDelete, confirmDelete };
};
