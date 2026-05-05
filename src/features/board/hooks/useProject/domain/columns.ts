import { type ColumnRename, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import { Result, type Result as ResultT } from "@/utils/result";
import { ProjectError } from "../errors";
import type { ProjectData } from "./projectData";

export type UpdateColumnsCommand = {
  columns: Column[];
  renames?: ColumnRename[];
  doneColumn?: string;
};

export type UpdateColumnsCommandBuilder = (
  current: ProjectData,
) => UpdateColumnsCommand | null;

const isColumnRemoved = (
  column: Column,
  command: UpdateColumnsCommand,
): boolean => !command.columns.some((next) => next.name === column.name);

export const Columns = {
  isCommandBuilder: (
    command: UpdateColumnsCommand | UpdateColumnsCommandBuilder,
  ): command is UpdateColumnsCommandBuilder => typeof command === "function",

  resolveCommand: (
    command: UpdateColumnsCommand | UpdateColumnsCommandBuilder,
    current: ProjectData,
  ): ResultT<UpdateColumnsCommand | null, ProjectError> => {
    if (!Columns.isCommandBuilder(command)) {
      return Result.ok(command);
    }
    try {
      return Result.ok(command(current));
    } catch (error) {
      return Result.err(ProjectError.tauri(TauriError.from(error)));
    }
  },

  isDoneColumnSensitive: (
    currentColumns: Column[],
    command: UpdateColumnsCommand,
  ): boolean => {
    if ((command.renames ?? []).length > 0) {
      return true;
    }
    return currentColumns.some((column) => isColumnRemoved(column, command));
  },

  validateDoneColumn: (
    knownDoneColumn: string | undefined,
    command: UpdateColumnsCommand,
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
