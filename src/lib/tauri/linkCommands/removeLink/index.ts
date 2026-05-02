import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { LinkParams } from "../types";

/**
 * sourceFilePath タスクの links から targetFilePath を削除する。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const removeLink = (
  params: LinkParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("remove_link", params);
