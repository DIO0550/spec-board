import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useDeleteFlow } from "@/features/detail/hooks/useDeleteFlow";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Task, TaskId } from "@/types/task";

/**
 * タスク削除を要求するcallback。
 * @param id - 削除するタスクの ID
 * @param orphanStrategy - 子タスクの扱い方（子なしの場合は渡されない）
 */
export type DeleteTaskHandler = (
  id: TaskId,
  orphanStrategy?: OrphanStrategy,
) => void | Promise<void>;

/** DeleteFlowProvider の Props */
export type DeleteFlowProviderProps = {
  /** 削除対象タスク（id と子タスクの有無を使う） */
  task: Task;
  /** 削除実行 callback（App 側の invoke ラッパ） */
  onDelete: DeleteTaskHandler;
  /** 配下の children */
  children: ReactNode;
};

/** DeleteFlowProvider が公開する API */
export type DeleteFlowApi = {
  /** 確認ダイアログを表示すべきか（idle 以外なら true） */
  isOpen: boolean;
  /** 削除実行中か（deleting なら true） */
  isBusy: boolean;
  /** 確認ダイアログを開く。orphanStrategy を "clear" に戻してから idle → confirming */
  requestDelete: () => void;
  /** 確認をキャンセルする（confirming/error → idle） */
  cancelDelete: () => void;
  /** 削除を実行する（confirming/error → deleting → idle/error） */
  confirmDelete: () => Promise<void>;
  /** 子タスクがある場合の削除方針（clear / abort）。子なし時は無視される */
  orphanStrategy: OrphanStrategy;
  /**
   * 削除方針を変更する。
   * @param strategy - 選択された削除方針
   */
  setOrphanStrategy: (strategy: OrphanStrategy) => void;
};

const DeleteFlowContext = createContext<DeleteFlowApi | null>(null);

/**
 * 削除確認フロー（useDeleteFlow の state machine + orphanStrategy）を所有し配布する Provider。
 * 削除ボタン / ConfirmDialog / orphan ラジオ（PropertiesSidebar）と Esc 抑止（DetailScreenContent）が
 * `useDeleteFlowContext()` で読む。
 * @param props - {@link DeleteFlowProviderProps}
 * @returns Provider 要素
 */
export const DeleteFlowProvider = ({
  task,
  onDelete,
  children,
}: DeleteFlowProviderProps) => {
  const [orphanStrategy, setOrphanStrategy] = useState<OrphanStrategy>("clear");

  const hasChildren = task.hierarchy.childFilePaths.length > 0;
  const handleDelete = useCallback(() => {
    if (hasChildren) {
      return onDelete(task.id, orphanStrategy);
    }
    return onDelete(task.id);
  }, [task.id, hasChildren, orphanStrategy, onDelete]);

  const flow = useDeleteFlow({ onDelete: handleDelete });

  const requestDelete = useCallback(() => {
    setOrphanStrategy("clear");
    flow.requestDelete();
  }, [flow.requestDelete]);

  const api = useMemo<DeleteFlowApi>(
    () => ({
      isOpen: flow.isOpen,
      isBusy: flow.isBusy,
      requestDelete,
      cancelDelete: flow.cancelDelete,
      confirmDelete: flow.confirmDelete,
      orphanStrategy,
      setOrphanStrategy,
    }),
    [
      flow.isOpen,
      flow.isBusy,
      requestDelete,
      flow.cancelDelete,
      flow.confirmDelete,
      orphanStrategy,
    ],
  );

  return (
    <DeleteFlowContext.Provider value={api}>
      {children}
    </DeleteFlowContext.Provider>
  );
};

/**
 * DeleteFlowProvider の API を取得する。Provider の外で呼ぶと throw する。
 * @returns DeleteFlowApi
 * @throws Provider の外で呼ばれた場合
 */
export const useDeleteFlowContext = (): DeleteFlowApi => {
  const ctx = useContext(DeleteFlowContext);
  if (ctx === null) {
    throw new Error(
      "useDeleteFlowContext は <DeleteFlowProvider> の配下でのみ使用できます",
    );
  }
  return ctx;
};
