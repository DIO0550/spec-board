import { useCallback } from "react";
import {
  ProjectColumns,
  type ProjectColumnsChange,
} from "@/domains/project-columns";
import type { ProjectData } from "@/domains/project-data";
import {
  type ProjectColumnActionsContextValue,
  type ProjectError,
  projectErrorMessage,
} from "@/providers/ProjectProvider";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { UseToastsResult } from "@/types/toast";

export type ColumnDeleteCallback = (
  columnName: string,
  destColumn: string | undefined,
) => Promise<void>;

export type UseColumnDeleteOptions = {
  columns: readonly Column[];
  tasks: readonly Task[];
  updateColumns: ProjectColumnActionsContextValue["updateColumns"];
  showToast: UseToastsResult["showToast"];
  onError: (error: ProjectError, message: string) => void;
};

const buildColumnDeleteCommand = (
  current: ProjectData,
  columnName: string,
  destColumn: string | undefined,
): ProjectColumnsChange | null => {
  if (!current.columns.some((column) => column.name === columnName)) {
    return null;
  }
  if (current.columns.length <= 1) {
    return null;
  }
  if (
    destColumn !== undefined &&
    (destColumn === columnName ||
      !current.columns.some((column) => column.name === destColumn))
  ) {
    return null;
  }
  if (
    destColumn === undefined &&
    current.tasks.some((task) => task.status === columnName)
  ) {
    return null;
  }

  const remainingColumns = current.columns.filter(
    (column) => column.name !== columnName,
  );
  const doneColumn =
    current.doneColumn === columnName
      ? (destColumn ??
        ProjectColumns.resolveDoneColumn(remainingColumns, undefined))
      : undefined;
  return {
    columns: remainingColumns,
    renames:
      destColumn === undefined
        ? undefined
        : [{ from: columnName, to: destColumn }],
    doneColumn,
  };
};

/**
 * column削除callbackを生成する。
 *
 * @param options column・task一覧、更新action、通知callback
 * @returns column削除callback
 */
export const useColumnDelete = ({
  columns,
  tasks,
  updateColumns,
  showToast,
  onError,
}: UseColumnDeleteOptions): ColumnDeleteCallback =>
  useCallback(
    async (columnName, destColumn) => {
      if (!columns.some((column) => column.name === columnName)) {
        return;
      }
      if (columns.length <= 1) {
        showToast("最後のカラムは削除できません", "error");
        return;
      }
      if (
        destColumn !== undefined &&
        (destColumn === columnName ||
          !columns.some((column) => column.name === destColumn))
      ) {
        showToast("移動先カラムが不正です", "error");
        return;
      }
      if (
        destColumn === undefined &&
        tasks.some((task) => task.status === columnName)
      ) {
        showToast("タスクが残っているため移動先カラムが必要です", "error");
        return;
      }

      const result = await updateColumns((current) =>
        buildColumnDeleteCommand(current, columnName, destColumn),
      );
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        onError(result.error, `カラムの削除に失敗しました: ${message}`);
        throw new Error(message);
      }
      if (!result.value.applied) {
        const message =
          "カラムの削除が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラムを削除しました", "success");
    },
    [columns, tasks, updateColumns, showToast, onError],
  );
