import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetArchivedTasksPayload } from "../types";

/**
 * `.spec-board/archive/` 配下のアーカイブ済みタスク一覧を取得する。
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const getArchivedTasks = (): Promise<
  Result<GetArchivedTasksPayload, TauriError>
> => invokeWrapped<GetArchivedTasksPayload>("get_archived_tasks");
