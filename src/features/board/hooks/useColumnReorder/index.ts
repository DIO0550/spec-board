import { useCallback } from "react";
import type { ColumnReorderHandler } from "@/features/board/components/BoardColumnProvider";
import {
  isProjectSwitchedError,
  type ProjectColumnActionsContextValue,
  type ProjectError,
  projectErrorMessage,
} from "@/providers/ProjectProvider";

export type UseColumnReorderOptions = {
  reorderColumns: ProjectColumnActionsContextValue["reorderColumns"];
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
 * Board上のcolumn並び替えcallbackを生成する。
 *
 * @param options 並び替えaction、live region、エラー通知callback
 * @returns column並び替えcallback
 */
export const useColumnReorder = ({
  reorderColumns,
  announce,
  onError,
}: UseColumnReorderOptions): ColumnReorderHandler =>
  useCallback(
    async ({ fromColumnName, toColumnName }) => {
      const result = await reorderColumns(fromColumnName, toColumnName, {
        /**
         * 楽観更新の適用を読み上げる。
         * @param event - 移動したカラムと移動先の位置
         */
        onOptimisticApplied: (event) => {
          announce(
            `「${event.columnName}」を ${event.toIndex + 1} 番目に移動しました`,
          );
        },
        /**
         * 楽観更新の巻き戻しを読み上げる。
         * @param event - 巻き戻したカラム
         */
        onRollback: (event) => {
          announce(`「${event.columnName}」の移動を取り消しました`);
        },
      });
      if (result.ok || isProjectSwitchedError(result.error)) {
        return;
      }
      onError(
        result.error,
        `カラムの並び替えに失敗しました: ${projectErrorMessage(result.error)}`,
      );
    },
    [reorderColumns, announce, onError],
  );
