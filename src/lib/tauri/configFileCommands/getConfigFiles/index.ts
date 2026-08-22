import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetConfigFilesPayload } from "../types";

/**
 * `.spec-board` 配下の設定ファイル一覧を取得する。
 * @returns 設定ファイル一覧、または失敗を表す Result
 */
export const getConfigFiles = (): Promise<
  Result<GetConfigFilesPayload, TauriError>
> => invokeWrapped<GetConfigFilesPayload>("get_config_files");
