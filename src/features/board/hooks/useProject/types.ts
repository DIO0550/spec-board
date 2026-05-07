import type {
  CreateTaskParams,
  DeleteTaskParams,
  UpdateTaskParams,
} from "@/lib/tauri";
import type { Task } from "@/types/task";
import type { Result as ResultT } from "@/utils/result";
import type {
  ColumnsCommand,
  ColumnsCommandBuilder,
} from "./actions/columnsCommand";
import type { ProjectState } from "./domain/projectState";
import type { ProjectError } from "./errors";

export type {
  ColumnsCommand,
  ColumnsCommandBuilder,
} from "./actions/columnsCommand";

export type UpdateColumnsInput = ColumnsCommand | ColumnsCommandBuilder;

export type UseProjectOptions = {
  onError?: (error: ProjectError) => void;
};

export type UseProjectResult = {
  state: ProjectState;
  /** ディレクトリダイアログを開いて project を読み込む。 */
  openProject: () => Promise<void>;
  /**
   * task を作成し、成功時に state へ反映する。
   * @param params 作成パラメータ
   * @returns 作成結果または ProjectError
   */
  createTask: (
    params: CreateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  /**
   * task を更新し、成功時に state へ反映する。
   * @param params 更新パラメータ
   * @returns 更新結果または ProjectError
   */
  updateTask: (
    params: UpdateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  /**
   * task を削除し、成功時に state へ反映する。
   * @param params 削除パラメータ
   * @returns 成否を表す Result または ProjectError
   */
  deleteTask: (
    params: DeleteTaskParams,
  ) => Promise<ResultT<void, ProjectError>>;
  /**
   * column 構成を更新する command または builder を解決して反映する。
   * @param command 静的な column 更新命令、または最新 ProjectData から命令を作る builder
   * @returns invoke したかどうかを含む Result または ProjectError
   */
  updateColumns: (
    command: UpdateColumnsInput,
  ) => Promise<ResultT<{ applied: boolean }, ProjectError>>;
  /** project state を初期状態に戻す。 */
  reset: () => void;
};
