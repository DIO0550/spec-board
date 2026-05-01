import { invoke } from "@tauri-apps/api/core";
import type { Priority } from "@/domains/priority";
import { Result, type Result as ResultT } from "@/lib/result";
import type { Task } from "@/types/task";
import { TauriError } from "./tauriError";

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

/**
 * 既存タスクの md ファイルを更新する。
 * @param params 更新パラメータ（filePath で対象を特定し、指定キーのみ更新）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const updateTask = async (
  params: UpdateTaskParams,
): Promise<ResultT<Task, TauriError>> => {
  try {
    const task = await invoke<Task>("update_task", params);
    return Result.ok(task);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
