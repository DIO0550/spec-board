import { useCallback } from "react";
import {
  type ProjectColumnActionsContextValue,
  type ProjectError,
  projectErrorMessage,
} from "@/providers/ProjectProvider";
import type { Column } from "@/types/column";
import type { UseToastsResult } from "@/types/toast";

export type ColumnAddCallback = (columnName: string) => Promise<void>;

export type UseColumnAddOptions = {
  columns: readonly Column[];
  updateColumns: ProjectColumnActionsContextValue["updateColumns"];
  showToast: UseToastsResult["showToast"];
  onError: (error: ProjectError, message: string) => void;
};

/**
 * column追加callbackを生成する。
 *
 * @param options column一覧、更新action、通知callback
 * @returns column追加callback
 */
export const useColumnAdd = ({
  columns,
  updateColumns,
  showToast,
  onError,
}: UseColumnAddOptions): ColumnAddCallback =>
  useCallback(
    async (columnName) => {
      if (columns.some((column) => column.name === columnName)) {
        showToast("同じ名前のカラムが既に存在します", "error");
        return;
      }

      const result = await updateColumns((current) => {
        if (current.columns.some((column) => column.name === columnName)) {
          return null;
        }
        const maxOrder = current.columns.reduce(
          (value, column) => Math.max(value, column.order),
          -1,
        );
        return {
          columns: [
            ...current.columns,
            { name: columnName, order: maxOrder + 1 },
          ],
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        onError(result.error, `カラムの追加に失敗しました: ${message}`);
        throw new Error(message);
      }
      if (!result.value.applied) {
        const message =
          "カラムの追加が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラムを追加しました", "success");
    },
    [columns, updateColumns, showToast, onError],
  );
