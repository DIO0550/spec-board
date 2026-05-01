import type { Priority } from "@/domains/priority";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { invokeWrapped } from "../invokeWrapped";
import type { TauriError } from "../tauriError";

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

/**
 * プロジェクトディレクトリを開き、タスク・カラム名一覧を取得する。
 * @param params 引数オブジェクト
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const openProject = (
  params: OpenProjectParams,
): Promise<Result<OpenProjectPayload, TauriError>> =>
  invokeWrapped<OpenProjectPayload>("open_project", params);

/**
 * 現在のプロジェクト内の全タスクを取得する。
 * @returns 成功時は Result.ok(Task[])、失敗時は Result.err(TauriError)
 */
export const getTasks = (): Promise<Result<Task[], TauriError>> =>
  invokeWrapped<Task[]>("get_tasks");

/**
 * 新規タスクの md ファイルを作成する。
 * @param params 作成パラメータ（title / status は必須、その他は任意）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const createTask = (
  params: CreateTaskParams,
): Promise<Result<Task, TauriError>> =>
  invokeWrapped<Task>("create_task", params);

/**
 * 既存タスクの md ファイルを更新する。
 * @param params 更新パラメータ（filePath で対象を特定し、指定キーのみ更新）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const updateTask = (
  params: UpdateTaskParams,
): Promise<Result<Task, TauriError>> =>
  invokeWrapped<Task>("update_task", params);

/**
 * タスクの md ファイルを削除する。
 * @param params 削除パラメータ（filePath / orphanStrategy 任意）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const deleteTask = (
  params: DeleteTaskParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("delete_task", params);
