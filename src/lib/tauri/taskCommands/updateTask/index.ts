import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";
import type { UpdateTaskParams } from "../types";

/**
 * 既存タスクの md ファイルを更新する。
 * @param params 更新パラメータ（filePath で対象を特定し、指定キーのみ更新）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const updateTask = (
  params: UpdateTaskParams,
): Promise<Result<Task, TauriError>> =>
  invokeWrapped<TaskPayload>("update_task", params).then((result) =>
    ResultDomain.map(result, Task.fromPayload),
  );
