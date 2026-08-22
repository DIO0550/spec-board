import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { OpenConfigFileArgs } from "../types";

/**
 * 設定ファイルを OS 既定のアプリケーションで開く。
 * @param args - 開く設定ファイルを指す引数
 * @returns 成否を表す Result
 */
export const openConfigFile = (
  args: OpenConfigFileArgs,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("open_config_file", { args });
