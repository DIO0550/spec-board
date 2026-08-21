import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";

/**
 * ゴミ箱を空にする（全件を完全に削除。復元不可）。
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const emptyTrash = (): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("empty_trash");
