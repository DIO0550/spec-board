import { type ColumnRename, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import { Result, type Result as ResultT } from "@/utils/result";
import type { ProjectData } from "../domain/projectData";
import { ProjectError } from "../errors";

export type ColumnsCommand = {
  columns: Column[];
  renames?: ColumnRename[];
  doneColumn?: string;
};

export type ColumnsCommandBuilder = (
  current: ProjectData,
) => ColumnsCommand | null;

export const ColumnsCommand = {
  /**
   * updateColumns に渡された値が command builder か判定する。
   *
   * @param command 静的 command または command builder
   * @returns builder 関数なら true
   */
  isBuilder: (
    command: ColumnsCommand | ColumnsCommandBuilder,
  ): command is ColumnsCommandBuilder => typeof command === "function",

  /**
   * 静的 command または builder から、適用する command を取得する。
   *
   * @param command 静的 command または command builder
   * @param current builder に渡す最新 ProjectData
   * @returns command、no-op の null、または builder 例外を包んだ ProjectError
   */
  resolve: (
    command: ColumnsCommand | ColumnsCommandBuilder,
    current: ProjectData,
  ): ResultT<ColumnsCommand | null, ProjectError> => {
    if (!ColumnsCommand.isBuilder(command)) {
      return Result.ok(command);
    }
    try {
      return Result.ok(command(current));
    } catch (error) {
      return Result.err(ProjectError.tauri(TauriError.from(error)));
    }
  },
} as const;
