import type { Priority } from "@/domains/priority";
import type { Task, TaskPayload } from "@/types/task";

/** open_project 引数。 */
export type OpenProjectParams = {
  /** プロジェクトディレクトリの絶対パス */
  path: string;
};

/** open_project 戻り値ペイロード（BE 仕様準拠）。 */
export type OpenProjectPayload = {
  /** プロジェクト内のタスク一覧 */
  tasks: Task[];
  /** カラム名一覧 */
  columns: string[];
};

/** open_project が Tauri IPC から返す raw payload。 */
export type OpenProjectRawPayload = {
  /** プロジェクト内の flat task payload 一覧 */
  tasks: TaskPayload[];
  /** カラム名一覧 */
  columns: string[];
};

/** create_task 引数（title / status は必須、その他は任意）。 */
export type CreateTaskParams = {
  /** タスクタイトル */
  title: string;
  /** ステータス（カラム名） */
  status: string;
  /** 優先度（任意） */
  priority?: Priority;
  /** ラベル一覧（任意） */
  labels?: string[];
  /** 親タスクのファイルパス（任意） */
  parent?: string;
  /** Markdown 本文（任意） */
  body?: string;
};

/** update_task 引数（filePath 必須、それ以外は任意の部分更新）。 */
export type UpdateTaskParams = {
  /** 更新対象タスクのファイルパス */
  filePath: string;
  /** タスクタイトル（任意） */
  title?: string;
  /** ステータス（任意） */
  status?: string;
  /** 優先度（任意） */
  priority?: Priority;
  /** ラベル一覧（任意） */
  labels?: string[];
  /** 親タスクのファイルパス（任意。空文字で親解除） */
  parent?: string;
  /** Markdown 本文（任意） */
  body?: string;
};

/** 子タスクが存在する場合の処理方針。 */
export type OrphanStrategy = "clear" | "abort";

/** delete_task 引数。 */
export type DeleteTaskParams = {
  /** 削除対象タスクのファイルパス */
  filePath: string;
  /** 子タスクへの方針（任意） */
  orphanStrategy?: OrphanStrategy;
};
