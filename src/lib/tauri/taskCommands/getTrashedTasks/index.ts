import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetTrashedTasksPayload } from "../types";

/**
 * `.spec-board/trash/` 配下のゴミ箱内タスク一覧を取得する。
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const getTrashedTasks = (): Promise<
  Result<GetTrashedTasksPayload, TauriError>
> => invokeWrapped<GetTrashedTasksPayload>("get_trashed_tasks");
