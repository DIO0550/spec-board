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
import type { MoveTaskCallbacks, MoveTaskParams } from "./actions/moveTask";
import type {
  ReorderColumnsCallbacks,
  ReorderColumnsParams,
  ReorderColumnsResult,
} from "./actions/reorderColumns";
import type { ProjectError } from "./errors";
import type { ProjectSessionState } from "./state/projectSessionState";

export type {
  ColumnsCommand,
  ColumnsCommandBuilder,
} from "./actions/columnsCommand";
export type { MoveTaskCallbacks, MoveTaskParams } from "./actions/moveTask";
export type {
  ReorderColumnsCallbacks,
  ReorderColumnsEvent,
  ReorderColumnsParams,
  ReorderColumnsResult,
} from "./actions/reorderColumns";

export type UpdateColumnsInput = ColumnsCommand | ColumnsCommandBuilder;

export type UseProjectOptions = {
  onError?: (error: ProjectError) => void;
};

export type UseProjectResult = {
  state: ProjectSessionState;
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
  /**
   * task のカラム間移動 / カラム内並び替えを単一 entry point で受け付ける。
   * 楽観 dispatch / rollback の発生を callback で通知する。
   * @param params 移動パラメータ
   * @param callbacks 楽観 / rollback の通知 callback（省略可）
   * @returns 成否を表す Result または ProjectError
   */
  moveTask: (
    params: MoveTaskParams,
    callbacks?: MoveTaskCallbacks,
  ) => Promise<ResultT<void, ProjectError>>;
  /**
   * カラムを並び替えて全カラムの order を 0-origin で再採番する。
   * 楽観 dispatch / rollback / a11y announce は callback で通知する。
   *
   * @param fromColumnName 移動元カラム名
   * @param toColumnName 移動先カラム名
   * @param callbacks 楽観 / rollback の通知 callback（省略可）
   * @returns invoke / dispatch まで進んだかを表す Result
   */
  reorderColumns: (
    fromColumnName: ReorderColumnsParams["fromColumnName"],
    toColumnName: ReorderColumnsParams["toColumnName"],
    callbacks?: ReorderColumnsCallbacks,
  ) => Promise<ResultT<ReorderColumnsResult, ProjectError>>;
  /**
   * source タスクから target タスクへの link を追加し、source / target 両方に
   * 楽観 dispatch → IPC → 成功で source canonical / 失敗で条件付き rollback する。
   *
   * @param params link 元 / 先 filePath
   * @returns 更新後の source Task または ProjectError
   */
  addLink: (params: {
    filePath: string;
    targetFilePath: string;
  }) => Promise<ResultT<Task, ProjectError>>;
  /**
   * source タスクから target タスクへの link を削除し、source / target 両方に
   * 楽観 dispatch → IPC → 成功で source canonical / 失敗で条件付き rollback する。
   *
   * @param params link 元 / 先 filePath
   * @returns 更新後の source Task または ProjectError
   */
  removeLink: (params: {
    filePath: string;
    targetFilePath: string;
  }) => Promise<ResultT<Task, ProjectError>>;
  /** project state を初期状態に戻す。 */
  reset: () => void;
};
