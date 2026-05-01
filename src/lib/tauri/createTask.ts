import type { Priority } from "@/domains/priority";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { invokeWrapped } from "./invokeWrapped";
import type { TauriError } from "./tauriError";

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

/**
 * 新規タスクの md ファイルを作成する。
 * @param params 作成パラメータ（title / status は必須、その他は任意）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const createTask = (
  params: CreateTaskParams,
): Promise<Result<Task, TauriError>> =>
  invokeWrapped<Task>("create_task", params);
