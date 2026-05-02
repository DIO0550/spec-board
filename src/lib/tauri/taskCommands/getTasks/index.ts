import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";

/**
 * 現在のプロジェクト内の全タスクを取得する。
 * @returns 成功時は Result.ok(Task[])、失敗時は Result.err(TauriError)
 */
export const getTasks = (): Promise<Result<Task[], TauriError>> =>
  invokeWrapped<Task[]>("get_tasks");
