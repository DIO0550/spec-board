import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { LinkParams } from "../types";

/**
 * sourceFilePath タスクの links に targetFilePath を追加する（重複時は noop / BE 側仕様）。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const addLink = (
  params: LinkParams,
): Promise<Result<void, TauriError>> => invokeWrapped<void>("add_link", params);
