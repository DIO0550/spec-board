import { invoke } from "@tauri-apps/api/core";
import { Result, type Result as ResultT } from "@/lib/result";
import type { Task } from "@/types/task";
import { TauriError } from "./tauriError";

/**
 * 現在のプロジェクト内の全タスクを取得する。
 * @returns 成功時は Result.ok(Task[])、失敗時は Result.err(TauriError)
 */
export const getTasks = async (): Promise<ResultT<Task[], TauriError>> => {
  try {
    const tasks = await invoke<Task[]>("get_tasks");
    return Result.ok(tasks);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
