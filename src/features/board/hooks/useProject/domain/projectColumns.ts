import type { ColumnRename } from "@/lib/tauri";
import type { Column } from "@/types/column";
import { Result, type Result as ResultT } from "@/utils/result";
import { ProjectError } from "../errors";

export type ProjectColumnsChange = {
  columns: Column[];
  renames?: ColumnRename[];
  doneColumn?: string;
};

/**
 * change 適用後に既存 column が削除されるか判定する。
 *
 * @param column 現在存在する column
 * @param change 適用予定の column 変更
 * @returns change.columns に column が含まれないなら true
 */
const isColumnRemoved = (
  column: Column,
  change: ProjectColumnsChange,
): boolean => !change.columns.some((next) => next.name === column.name);

export const ProjectColumns = {
  /**
   * doneColumn の再取得や検証が必要な column 変更か判定する。
   *
   * @param currentColumns 現在の columns
   * @param change 適用予定の column 変更
   * @returns rename または column 削除を含むなら true
   */
  isDoneColumnSensitive: (
    currentColumns: Column[],
    change: ProjectColumnsChange,
  ): boolean => {
    if ((change.renames ?? []).length > 0) {
      return true;
    }
    return currentColumns.some((column) => isColumnRemoved(column, change));
  },

  /**
   * doneColumn を壊す column 変更を invoke 前に拒否する。
   *
   * @param knownDoneColumn 現在判明している doneColumn
   * @param change 適用予定の column 変更
   * @returns 不変条件を満たすなら ok、壊す可能性があれば invalid-state
   */
  validateDoneColumn: (
    knownDoneColumn: string | undefined,
    change: ProjectColumnsChange,
  ): ResultT<void, ProjectError> => {
    if (
      knownDoneColumn !== undefined &&
      !change.columns.some((column) => column.name === knownDoneColumn) &&
      change.doneColumn === undefined
    ) {
      return Result.err(
        ProjectError.invalidState(
          "doneColumn を削除する操作は新しい doneColumn の指定が必要です",
        ),
      );
    }

    if (
      change.doneColumn !== undefined &&
      !change.columns.some((column) => column.name === change.doneColumn)
    ) {
      return Result.err(
        ProjectError.invalidState(
          `doneColumn "${change.doneColumn}" は columns に存在しません`,
        ),
      );
    }

    return Result.ok(undefined);
  },
} as const;
