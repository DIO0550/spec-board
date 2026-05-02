import type { Result } from "@/utils/result";
import { invokeWrapped } from "../invokeWrapped";
import type { TauriError } from "../tauriError";

/** add_link / remove_link 共通の引数。 */
export type LinkParams = {
  /** リンク元タスクのファイルパス */
  sourceFilePath: string;
  /** リンク先タスクのファイルパス */
  targetFilePath: string;
};

/**
 * sourceFilePath タスクの links に targetFilePath を追加する（重複時は noop / BE 側仕様）。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const addLink = (
  params: LinkParams,
): Promise<Result<void, TauriError>> => invokeWrapped<void>("add_link", params);

/**
 * sourceFilePath タスクの links から targetFilePath を削除する。
 * @param params sourceFilePath / targetFilePath
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const removeLink = (
  params: LinkParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("remove_link", params);
