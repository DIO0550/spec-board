import { useCallback } from "react";
import type { TaskUpdateHandler } from "@/features/detail/hooks/useDetailFieldHandlers";
import {
  type ProjectError,
  projectErrorMessage,
  type ProjectTaskActionsContextValue,
} from "@/providers/ProjectProvider";
import type { Task } from "@/types/task";
import type { UseToastsResult } from "@/types/toast";

export type UseTaskUpdateOptions = {
  tasks: readonly Task[];
  updateTask: ProjectTaskActionsContextValue["updateTask"];
  showToast: UseToastsResult["showToast"];
  onError: (error: ProjectError, message: string) => void;
};

/**
 * Detail画面用のtask更新callbackを生成する。
 * @param options task一覧、更新action、通知callback
 * @returns task更新callback
 */
export const useTaskUpdate = ({
  tasks,
  updateTask,
  showToast,
  onError,
}: UseTaskUpdateOptions): TaskUpdateHandler =>
  useCallback(
    async (id, updates) => {
      const filePath = tasks.find((task) => task.id === id)?.filePath;
      if (filePath === undefined) {
        return;
      }
      const result = await updateTask({ ...updates, filePath });
      if (!result.ok) {
        onError(
          result.error,
          `タスクの更新に失敗しました: ${projectErrorMessage(result.error)}`,
        );
        return;
      }
      showToast("タスクを更新しました", "success");
    },
    [tasks, updateTask, onError, showToast],
  );
