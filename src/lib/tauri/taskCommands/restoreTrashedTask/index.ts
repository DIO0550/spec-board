import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type {
  RestoreTrashedTaskParams,
  RestoreTrashedTaskPayload,
} from "../types";

/**
 * ゴミ箱内タスクを元の場所へ復元する。ボードへの反映は watcher 経由。
 * @param params 復元パラメータ（filePath = ゴミ箱内相対パス）
 * @returns 成功時は復元先パスを含む payload、失敗時は Result.err(TauriError)
 */
export const restoreTrashedTask = (
  params: RestoreTrashedTaskParams,
): Promise<Result<RestoreTrashedTaskPayload, TauriError>> =>
  invokeWrapped<RestoreTrashedTaskPayload>("restore_trashed_task", {
    args: params,
  });
