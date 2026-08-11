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
  announce: (message: string) => void;
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
        onOptimisticApplied: (event) => {
          announce(
            `「${event.columnName}」を ${event.toIndex + 1} 番目に移動しました`,
          );
        },
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
