import { type ColumnRename, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import { Result, type Result as ResultT } from "@/utils/result";
import { ProjectError } from "../errors";
import type { ProjectData } from "./projectData";

export type ColumnsCommand = {
  columns: Column[];
  renames?: ColumnRename[];
  doneColumn?: string;
};

export type ColumnsCommandBuilder = (
  current: ProjectData,
) => ColumnsCommand | null;

/**
 * command 適用後に既存 column が削除されるか判定する。
 *
 * @param column 現在存在する column
 * @param command 適用予定の column 更新命令
 * @returns command.columns に column が含まれないなら true
 */
const isColumnRemoved = (column: Column, command: ColumnsCommand): boolean =>
  !command.columns.some((next) => next.name === column.name);

export const ColumnsAction = {
  /**
   * updateColumns に渡された値が command builder か判定する。
   *
   * @param command 静的 command または command builder
   * @returns builder 関数なら true
   */
  isCommandBuilder: (
    command: ColumnsCommand | ColumnsCommandBuilder,
  ): command is ColumnsCommandBuilder => typeof command === "function",

  /**
   * 静的 command または builder から、適用する command を取得する。
   *
   * @param command 静的 command または command builder
   * @param current builder に渡す最新 ProjectData
   * @returns command、no-op の null、または builder 例外を包んだ ProjectError
   */
  resolveCommand: (
    command: ColumnsCommand | ColumnsCommandBuilder,
    current: ProjectData,
  ): ResultT<ColumnsCommand | null, ProjectError> => {
    if (!ColumnsAction.isCommandBuilder(command)) {
      return Result.ok(command);
    }
    try {
      return Result.ok(command(current));
    } catch (error) {
      return Result.err(ProjectError.tauri(TauriError.from(error)));
    }
  },

  /**
   * doneColumn の再取得や検証が必要な column 更新か判定する。
   *
   * @param currentColumns 現在の columns
   * @param command 適用予定の column 更新命令
   * @returns rename または column 削除を含むなら true
   */
  isDoneColumnSensitive: (
    currentColumns: Column[],
    command: ColumnsCommand,
  ): boolean => {
    if ((command.renames ?? []).length > 0) {
      return true;
    }
    return currentColumns.some((column) => isColumnRemoved(column, command));
  },

  /**
   * doneColumn を壊す column 更新を invoke 前に拒否する。
   *
   * @param knownDoneColumn 現在判明している doneColumn
   * @param command 適用予定の column 更新命令
   * @returns 不変条件を満たすなら ok、壊す可能性があれば invalid-state
   */
  validateDoneColumn: (
    knownDoneColumn: string | undefined,
    command: ColumnsCommand,
  ): ResultT<void, ProjectError> => {
    if (
      knownDoneColumn !== undefined &&
      !command.columns.some((column) => column.name === knownDoneColumn) &&
      command.doneColumn === undefined
    ) {
      return Result.err(
        ProjectError.invalidState(
          "doneColumn を削除する操作は新 doneColumn を command.doneColumn で指定する必要があります",
        ),
      );
    }

    if (
      command.doneColumn !== undefined &&
      !command.columns.some((column) => column.name === command.doneColumn)
    ) {
      return Result.err(
        ProjectError.invalidState(
          `command.doneColumn "${command.doneColumn}" は command.columns に存在しません`,
        ),
      );
    }

    return Result.ok(undefined);
  },
} as const;
