import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { OpenProjectParams, OpenProjectPayload } from "../types";

/**
 * プロジェクトディレクトリを開き、タスク・カラム名一覧を取得する。
 * @param params 引数オブジェクト
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const openProject = (
  params: OpenProjectParams,
): Promise<Result<OpenProjectPayload, TauriError>> =>
  invokeWrapped<OpenProjectPayload>("open_project", params);
