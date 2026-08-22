import { useCallback } from "react";
import type { TaskDropHandler } from "@/features/board/components/BoardCardProvider";
import {
  type ProjectError,
  type ProjectTaskActionsContextValue,
  projectErrorMessage,
} from "@/providers/ProjectProvider";
import type { Task } from "@/types/task";

export type UseTaskMoveOptions = {
  tasks: readonly Task[];
  moveTask: ProjectTaskActionsContextValue["moveTask"];
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
};

/**
 * Board上のtask移動callbackを生成する。
 * @param options task一覧、移動action、通知callback
 * @returns task drop callback
 */
export const useTaskMove = ({
  tasks,
  moveTask,
  announce,
  onError,
}: UseTaskMoveOptions): TaskDropHandler =>
  useCallback(
    async (params) => {
      const title =
        tasks.find((task) => task.filePath === params.taskFilePath)?.title ??
        params.taskFilePath;
      const result = await moveTask(params, {
        /**
         * 楽観更新の適用を読み上げる。カラムが変わらない場合は読み上げない。
         * @param event - 移動元と移動先のカラム
         */
        onOptimisticApplied: ({ fromColumn, toColumn }) => {
          if (fromColumn !== toColumn) {
            announce(`「${title}」を「${toColumn}」に移動しました`);
          }
        },
        /** 楽観更新の巻き戻しを読み上げる。 */
        onRollback: () => {
          announce(`「${title}」の移動を取り消しました`);
        },
      });
      if (!result.ok) {
        onError(
          result.error,
          `タスクの移動に失敗しました: ${projectErrorMessage(result.error)}`,
        );
      }
    },
    [tasks, moveTask, announce, onError],
  );
