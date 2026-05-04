import { open } from "@tauri-apps/plugin-dialog";
import { TauriError } from "@/lib/tauri/tauriError";
import { Result, type Result as ResultT } from "@/utils/result";

/**
 * OS のディレクトリ選択 dialog を開く。
 * - 選択された: Result.ok(path)
 * - キャンセル: Result.ok(null)
 * - dialog plugin 例外: Result.err(TauriError)
 *
 * @returns 成否を表す Result。
 */
export const openDirectoryDialog = async (): Promise<
  ResultT<string | null, TauriError>
> => {
  try {
    const selected = await open({ directory: true, multiple: false });
    return Result.ok(typeof selected === "string" ? selected : null);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
