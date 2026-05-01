import { invoke } from "@tauri-apps/api/core";
import { Result, type Result as ResultT } from "@/lib/result";
import type { Task } from "@/types/task";
import { TauriError } from "./tauriError";

/** open_project 戻り値ペイロード（BE 仕様準拠）。 */
export type OpenProjectPayload = {
  /** プロジェクト内のタスク一覧 */
  tasks: Task[];
  /** カラム名一覧 */
  columns: string[];
};

/**
 * プロジェクトディレクトリを開き、タスク・カラム名一覧を取得する。
 * @param params 引数オブジェクト
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const openProject = async (params: {
  path: string;
}): Promise<ResultT<OpenProjectPayload, TauriError>> => {
  try {
    const payload = await invoke<OpenProjectPayload>("open_project", params);
    return Result.ok(payload);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
