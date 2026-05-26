import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";
import type { LinkParams } from "../types";

/**
 * sourceFilePath タスクの links から targetFilePath を削除する。
 * 成功時は更新後の source Task を返す（addLink と対称、canonical 再 dispatch に使う）。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は `Result.ok(Task)`（更新後の source Task）、失敗時は `Result.err(TauriError)`
 */
export const removeLink = (
  params: LinkParams,
): Promise<Result<Task, TauriError>> =>
  invokeWrapped<TaskPayload>("remove_link", params).then((result) =>
    ResultDomain.map(result, Task.fromPayload),
  );
