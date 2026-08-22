import { useCallback } from "react";
import {
  type ProjectColumnActionsContextValue,
  type ProjectError,
  projectErrorMessage,
} from "@/providers/ProjectProvider";
import type { Column } from "@/types/column";
import type { UseToastsResult } from "@/types/toast";

export type ColumnRenameCallback = (
  oldName: string,
  newName: string,
) => Promise<void>;

export type UseColumnRenameOptions = {
  columns: readonly Column[];
  updateColumns: ProjectColumnActionsContextValue["updateColumns"];
  showToast: UseToastsResult["showToast"];
  /**
   * カラム名変更の失敗を画面へ伝えるcallback。
   * @param error - 失敗の内容
   * @param message - 利用者向けのメッセージ
   */
  onError: (error: ProjectError, message: string) => void;
};

/**
 * column名変更callbackを生成する。
 *
 * @param options column一覧、更新action、通知callback
 * @returns column名変更callback
 */
export const useColumnRename = ({
  columns,
  updateColumns,
  showToast,
  onError,
}: UseColumnRenameOptions): ColumnRenameCallback =>
  useCallback(
    async (oldName, newName) => {
      if (!columns.some((column) => column.name === oldName)) {
        return;
      }
      if (columns.some((column) => column.name === newName)) {
        showToast("同じ名前のカラムが既に存在します", "error");
        return;
      }

      const result = await updateColumns((current) => {
        if (!current.columns.some((column) => column.name === oldName)) {
          return null;
        }
        if (current.columns.some((column) => column.name === newName)) {
          return null;
        }
        return {
          columns: current.columns.map((column) =>
            column.name === oldName ? { ...column, name: newName } : column,
          ),
          renames: [{ from: oldName, to: newName }],
          doneColumn: current.doneColumn === oldName ? newName : undefined,
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        onError(result.error, `カラム名の変更に失敗しました: ${message}`);
        throw new Error(message);
      }
      if (!result.value.applied) {
        const message =
          "カラム名の変更が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラム名を変更しました", "success");
    },
    [columns, updateColumns, showToast, onError],
  );
