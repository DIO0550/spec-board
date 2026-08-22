import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { ConfigFilePayload } from "../types";

/**
 * 現在のカラム設定から GUIDE.md を再生成する。
 * @returns 再生成した設定ファイル情報、または失敗を表す Result
 */
export const regenerateGuide = (): Promise<
  Result<ConfigFilePayload, TauriError>
> => invokeWrapped<ConfigFilePayload>("regenerate_guide");
