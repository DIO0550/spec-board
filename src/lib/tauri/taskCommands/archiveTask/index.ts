import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { ArchiveTaskParams } from "../types";

/**
 * タスクの md ファイルを `.spec-board/archive/` へ移動する。
 * @param params アーカイブパラメータ（filePath）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const archiveTask = (
  params: ArchiveTaskParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("archive_task", { args: params });
