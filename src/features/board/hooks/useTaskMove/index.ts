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
  announce: (message: string) => void;
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
        onOptimisticApplied: ({ fromColumn, toColumn }) => {
          if (fromColumn !== toColumn) {
            announce(`「${title}」を「${toColumn}」に移動しました`);
          }
        },
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
