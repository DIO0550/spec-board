import type { Result } from "@/utils/result";
import { invokeWrapped } from "../invokeWrapped";
import type { TauriError } from "../tauriError";

/** update_card_order 引数。 */
export type UpdateCardOrderParams = {
  /** 対象カラム名 */
  columnName: string;
  /** 新しい並び順（タスクファイルパスの配列。先頭が最上位） */
  filePaths: string[];
};

/**
 * 指定カラムのカード並び順を上書き保存する。
 * @param params columnName / filePaths
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const updateCardOrder = (
  params: UpdateCardOrderParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("update_card_order", params);
