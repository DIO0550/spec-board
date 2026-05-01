import { invoke } from "@tauri-apps/api/core";
import { Result, type Result as ResultT } from "@/lib/result";
import { TauriError } from "./tauriError";

/** 子タスクが存在する場合の処理方針。 */
export type OrphanStrategy = "clear" | "abort";

/** delete_task 引数。 */
export type DeleteTaskParams = {
  /** 削除対象タスクのファイルパス */
  filePath: string;
  /** 子タスクへの方針（任意） */
  orphanStrategy?: OrphanStrategy;
};

/**
 * タスクの md ファイルを削除する。
 * @param params 削除パラメータ（filePath / orphanStrategy 任意）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const deleteTask = async (
  params: DeleteTaskParams,
): Promise<ResultT<void, TauriError>> => {
  try {
    await invoke<void>("delete_task", params);
    return Result.ok(undefined);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
