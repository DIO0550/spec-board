import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";

/**
 * 現在のプロジェクト内の全タスクを取得する。
 * @returns 成功時は Result.ok(Task[])、失敗時は Result.err(TauriError)
 */
export const getTasks = (): Promise<Result<Task[], TauriError>> =>
  invokeWrapped<TaskPayload[]>("get_tasks").then((result) =>
    ResultDomain.map(result, (tasks) => tasks.map(Task.fromPayload)),
  );
