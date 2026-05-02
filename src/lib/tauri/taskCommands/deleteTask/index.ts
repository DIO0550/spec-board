import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { DeleteTaskParams } from "../types";

/**
 * タスクの md ファイルを削除する。
 * @param params 削除パラメータ（filePath / orphanStrategy 任意）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const deleteTask = (
  params: DeleteTaskParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("delete_task", params);
