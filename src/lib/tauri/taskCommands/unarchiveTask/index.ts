import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { UnarchiveTaskParams, UnarchiveTaskPayload } from "../types";

/**
 * アーカイブ済みタスクを元の場所へ復元する。ボードへの反映は watcher 経由。
 * @param params 復元パラメータ（filePath = アーカイブ内相対パス）
 * @returns 成功時は復元先パスを含む payload、失敗時は Result.err(TauriError)
 */
export const unarchiveTask = (
  params: UnarchiveTaskParams,
): Promise<Result<UnarchiveTaskPayload, TauriError>> =>
  invokeWrapped<UnarchiveTaskPayload>("unarchive_task", { args: params });
