import type { Result } from "@/lib/result";
import type { Task } from "@/types/task";
import { invokeWrapped } from "./invokeWrapped";
import type { TauriError } from "./tauriError";

/**
 * 現在のプロジェクト内の全タスクを取得する。
 * @returns 成功時は Result.ok(Task[])、失敗時は Result.err(TauriError)
 */
export const getTasks = (): Promise<Result<Task[], TauriError>> =>
  invokeWrapped<Task[]>("get_tasks");
