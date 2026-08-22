import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";

/**
 * `.spec-board` フォルダを OS のファイラで表示する。
 * @returns 成否を表す Result
 */
export const revealConfigFolder = (): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("reveal_config_folder");
