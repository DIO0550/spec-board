import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { UpdateColumnsParams } from "../types";

/**
 * カラムの追加・削除・並び替え・リネーム・doneColumn 変更を 1 コマンドで適用する。
 * フィールドはすべて任意で、指定したものだけが更新される。
 * @param params columns / doneColumn / renames（任意）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const updateColumns = (
  params: UpdateColumnsParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("update_columns", params);
