import type { Result } from "@/utils/result";
import { invokeWrapped } from "./invokeWrapped";
import type { TauriError } from "./tauriError";

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
export const deleteTask = (
  params: DeleteTaskParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("delete_task", params);
