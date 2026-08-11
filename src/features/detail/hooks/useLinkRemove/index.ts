import { useCallback } from "react";
import {
  isProjectSwitchedError,
  type ProjectError,
  projectErrorMessage,
  type ProjectTaskActionsContextValue,
} from "@/providers/ProjectProvider";
import type { Task } from "@/types/task";

export type LinkRemoveCallback = (
  sourceFilePath: string,
  targetFilePath: string,
) => ReturnType<ProjectTaskActionsContextValue["removeLink"]>;

export type UseLinkRemoveOptions = {
  tasks: readonly Task[];
  removeLink: ProjectTaskActionsContextValue["removeLink"];
  announce: (message: string) => void;
  onError: (error: ProjectError, message: string) => void;
};

/**
 * task link削除callbackを生成する。
 *
 * @param options task一覧、link削除action、通知callback
 * @returns link削除callback
 */
export const useLinkRemove = ({
  tasks,
  removeLink,
  announce,
  onError,
}: UseLinkRemoveOptions): LinkRemoveCallback =>
  useCallback(
    async (sourceFilePath, targetFilePath) => {
      const sourceTitle =
        tasks.find((task) => task.filePath === sourceFilePath)?.title ??
        sourceFilePath;
      const targetTitle =
        tasks.find((task) => task.filePath === targetFilePath)?.title ??
        targetFilePath;
      const result = await removeLink({
        filePath: sourceFilePath,
        targetFilePath,
      });

      if (!result.ok) {
        if (isProjectSwitchedError(result.error)) {
          return result;
        }
        onError(
          result.error,
          `リンクの削除に失敗しました: ${projectErrorMessage(result.error)}`,
        );
        announce(
          `「${sourceTitle}」から「${targetTitle}」へのリンク削除を取り消しました`,
        );
        return result;
      }

      announce(
        `「${sourceTitle}」から「${targetTitle}」へのリンクを削除しました`,
      );
      return result;
    },
    [tasks, removeLink, announce, onError],
  );
