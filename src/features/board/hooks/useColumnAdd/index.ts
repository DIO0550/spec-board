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

/** Rustのu32 orderへ安全にシリアライズできる最大値。 */
const MAX_COLUMN_ORDER = 2 ** 32 - 1;
const COLUMN_ORDER_LIMIT_MESSAGE =
  "カラムを追加できません: カラムの並び順上限に達しています";

/**
 * 最新stateのcolumnsから追加カラムのorderを採番する。
 * u32の最大値に到達している場合は追加を中止する。
 * @param columns - 採番対象のカラム
 * @returns 新しいカラムへ割り当てるorder。上限到達時はnull。
 */
const nextColumnOrder = (columns: readonly Column[]): number | null => {
  const maxOrder = columns.reduce(
    (value, column) => Math.max(value, column.order),
    -1,
  );
  if (maxOrder >= MAX_COLUMN_ORDER) {
    return null;
  }
  return maxOrder + 1;
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
      const normalizedName = columnName.trim();
      if (normalizedName.length === 0) {
        const message = "カラム名を入力してください";
        showToast(message, "error");
        throw new Error(message);
      }
      if (columns.some((column) => column.name === normalizedName)) {
        const message = "同じ名前のカラムが既に存在します";
        showToast(message, "error");
        throw new Error(message);
      }
      if (nextColumnOrder(columns) === null) {
        showToast(COLUMN_ORDER_LIMIT_MESSAGE, "error");
        throw new Error(COLUMN_ORDER_LIMIT_MESSAGE);
      }

      const result = await updateColumns((current) => {
        if (current.columns.some((column) => column.name === normalizedName)) {
          return null;
        }
        const nextOrder = nextColumnOrder(current.columns);
        if (nextOrder === null) {
          return null;
        }
        const nextColumns = [
          ...current.columns,
          { name: normalizedName, order: nextOrder },
        ];
        const doneColumn = current.doneColumn;
        return {
          columns: nextColumns,
          ...(doneColumn !== undefined &&
          nextColumns.some((column) => column.name === doneColumn)
            ? { doneColumn }
            : {}),
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
