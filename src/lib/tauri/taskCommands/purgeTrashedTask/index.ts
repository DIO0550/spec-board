import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { PurgeTrashedTaskParams } from "../types";

/**
 * ゴミ箱内タスク 1 件を完全に削除する（復元不可）。
 * @param params 完全削除パラメータ（filePath = ゴミ箱内相対パス）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const purgeTrashedTask = (
  params: PurgeTrashedTaskParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("purge_trashed_task", { args: params });
