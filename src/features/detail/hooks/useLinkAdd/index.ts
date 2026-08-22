import { useCallback } from "react";
import {
  isProjectSwitchedError,
  type ProjectError,
  type ProjectTaskActionsContextValue,
  projectErrorMessage,
} from "@/providers/ProjectProvider";
import type { Task } from "@/types/task";

export type LinkAddCallback = (
  sourceFilePath: string,
  targetFilePath: string,
) => ReturnType<ProjectTaskActionsContextValue["addLink"]>;

export type UseLinkAddOptions = {
  tasks: readonly Task[];
  addLink: ProjectTaskActionsContextValue["addLink"];
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
 * task link追加callbackを生成する。
 *
 * @param options task一覧、link追加action、通知callback
 * @returns link追加callback
 */
export const useLinkAdd = ({
  tasks,
  addLink,
  announce,
  onError,
}: UseLinkAddOptions): LinkAddCallback =>
  useCallback(
    async (sourceFilePath, targetFilePath) => {
      const sourceTitle =
        tasks.find((task) => task.filePath === sourceFilePath)?.title ??
        sourceFilePath;
      const targetTitle =
        tasks.find((task) => task.filePath === targetFilePath)?.title ??
        targetFilePath;
      const result = await addLink({
        filePath: sourceFilePath,
        targetFilePath,
      });

      if (!result.ok) {
        if (isProjectSwitchedError(result.error)) {
          return result;
        }
        onError(
          result.error,
          `リンクの追加に失敗しました: ${projectErrorMessage(result.error)}`,
        );
        announce(
          `「${sourceTitle}」への「${targetTitle}」のリンク追加を取り消しました`,
        );
        return result;
      }

      announce(`「${sourceTitle}」に「${targetTitle}」をリンクしました`);
      return result;
    },
    [tasks, addLink, announce, onError],
  );
