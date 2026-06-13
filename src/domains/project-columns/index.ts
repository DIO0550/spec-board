import type { Column } from "@/types/column";
import { Result, type Result as ResultT } from "@/utils/result";

export type ProjectColumnRename = {
  from: string;
  to: string;
};

export type ProjectColumnsChange = {
  columns: Column[];
  renames?: ProjectColumnRename[];
  doneColumn?: string;
};

export type ProjectColumnsValidationError = {
  code: "doneColumnRemoved" | "doneColumnNotInColumns";
  message: string;
};

/** doneColumn が解決できないときに使う既定の完了カラム名。 */
export const DEFAULT_DONE_COLUMN = "Done";

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

/**
 * order が最大の column を返す（同 order は先勝ち）。空配列なら undefined。
 *
 * @param columns 対象 column 一覧
 * @returns order 最大の column。空なら undefined
 */
const maxOrderColumn = (columns: readonly Column[]): Column | undefined =>
  columns.reduce<Column | undefined>((currentMax, column) => {
    if (currentMax === undefined || column.order > currentMax.order) {
      return column;
    }
    return currentMax;
  }, undefined);

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
   * @returns 不変条件を満たすなら ok、壊す可能性があれば domain error
   */
  validateDoneColumn: (
    knownDoneColumn: string | undefined,
    change: ProjectColumnsChange,
  ): ResultT<void, ProjectColumnsValidationError> => {
    if (
      knownDoneColumn !== undefined &&
      !change.columns.some((column) => column.name === knownDoneColumn) &&
      change.doneColumn === undefined
    ) {
      return Result.err({
        code: "doneColumnRemoved",
        message:
          "doneColumn を削除する操作は新しい doneColumn の指定が必要です",
      });
    }

    if (
      change.doneColumn !== undefined &&
      !change.columns.some((column) => column.name === change.doneColumn)
    ) {
      return Result.err({
        code: "doneColumnNotInColumns",
        message: `doneColumn "${change.doneColumn}" は columns に存在しません`,
      });
    }

    return Result.ok(undefined);
  },

  /**
   * 完了として扱うカラム名を解決する。
   *
   * 明示指定（`override`）があればそれを最優先で返し、なければ order が最大の
   * カラムを完了カラムとみなす。columns が空など解決できないときは既定値 "Done" を返す。
   * ビューをまたいだ「完了カラムの解決ルール」の単一の真実源。
   *
   * @param columns カラム一覧
   * @param override 明示的な完了カラム名（任意）
   * @returns 完了カラム名
   */
  resolveDoneColumn: (
    columns: readonly Column[],
    override: string | undefined,
  ): string => {
    if (override !== undefined) {
      return override;
    }
    return maxOrderColumn(columns)?.name ?? DEFAULT_DONE_COLUMN;
  },
} as const;
