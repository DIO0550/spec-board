import { Task } from "@/domains/task";
import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TaskPayload } from "@/lib/tauri/taskCommands/types";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Result, type Result as ResultT } from "@/utils/result";
import type { LinkParams } from "../types";

/**
 * sourceFilePath タスクの links から targetFilePath を削除する。
 * 成功時は更新後の source Task を返す（addLink と対称、canonical 再 dispatch に使う）。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は `Result.ok(Task)`（更新後の source Task）、失敗時は `Result.err(TauriError)`
 */
export const removeLink = (
  params: LinkParams,
): Promise<ResultT<Task, TauriError>> =>
  invokeWrapped<TaskPayload>("remove_link", { args: params }).then((result) =>
    Result.map(result, Task.fromPayload),
  );
