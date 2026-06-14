import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import type { LinkParams } from "../types";

/**
 * sourceFilePath タスクの links に targetFilePath を追加する（重複時は noop / BE 側仕様）。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は Result.ok(Task)（更新後の source Task、noop 時は現状の source）、失敗時は Result.err(TauriError)
 */
export const addLink = (
  params: LinkParams,
): Promise<ResultT<Task, TauriError>> =>
  invokeWrapped<TaskPayload>("add_link", { args: params }).then((result) =>
    Result.map(result, Task.fromPayload),
  );
