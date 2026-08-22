import { useCallback } from "react";
import type { OrphanStrategy } from "@/lib/tauri";
import {
  isProjectSwitchedError,
  PROJECT_SWITCHED_MESSAGE,
  type ProjectError,
  type ProjectTaskActionsContextValue,
  projectErrorMessage,
} from "@/providers/ProjectProvider";
import type { Task } from "@/types/task";
import type { UseToastsResult } from "@/types/toast";

export type TaskDeleteCallback = (
  id: string,
  orphanStrategy?: OrphanStrategy,
) => Promise<void>;

export type UseTaskDeleteOptions = {
  tasks: readonly Task[];
  deleteTask: ProjectTaskActionsContextValue["deleteTask"];
  showToast: UseToastsResult["showToast"];
  /**
   * 操作結果をスクリーンリーダーへ通知する。
   * @param message - 読み上げる文言
   */
  announce: (message: string) => void;
  /**
   * 操作の失敗を画面へ伝えるcallback。
   * @param error - 失敗の内容
   * @param message - 利用者向けのメッセージ
   */
  onError: (error: ProjectError, message: string) => void;
  /**
   * 削除確認中のタスクを親へ伝える。
   * @param task - 確認中のタスク。確認を閉じたときは null
   */
  onPendingTaskChange: (task: Task | null) => void;
  /** 削除完了後に呼ばれるcallback。 */
  onDeleted: () => void;
};

/**
 * 詳細画面のtask削除callbackを生成する。
 *
 * @param options task一覧、削除action、表示更新callback
 * @returns task削除callback
 */
export const useTaskDelete = ({
  tasks,
  deleteTask,
  showToast,
  announce,
  onError,
  onPendingTaskChange,
  onDeleted,
}: UseTaskDeleteOptions): TaskDeleteCallback =>
  useCallback(
    async (id, orphanStrategy) => {
      const target = tasks.find((task) => task.id === id);
      if (target === undefined) {
        return;
      }

      const { filePath, title } = target;
      onPendingTaskChange(target);
      const result = await deleteTask({ filePath, orphanStrategy });

      if (!result.ok) {
        onPendingTaskChange(null);
        if (isProjectSwitchedError(result.error)) {
          throw new Error(PROJECT_SWITCHED_MESSAGE);
        }

        const message = projectErrorMessage(result.error);
        onError(result.error, `タスクの削除に失敗しました: ${message}`);
        announce(`「${title}」の削除を取り消しました`);
        throw new Error(message);
      }

      onDeleted();
      onPendingTaskChange(null);
      showToast("タスクを削除しました", "success");
      announce(`「${title}」を削除しました`);
    },
    [
      tasks,
      deleteTask,
      showToast,
      announce,
      onError,
      onPendingTaskChange,
      onDeleted,
    ],
  );
