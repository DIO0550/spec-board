import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { DeleteLabelPayload } from "../types";

/**
 * 指定 name のラベルを削除する。削除前の使用タスク件数を返す。
 * タスク frontmatter の labels 値は変更しない（非破壊）。
 * 失敗時は書き込み失敗トースト（mutation 通知）の対象。
 * @param name 削除対象ラベルの name
 * @returns 成功時は Result.ok({usageCount})、失敗時は Result.err(TauriError)
 */
export const deleteLabel = (
  name: string,
): Promise<Result<DeleteLabelPayload, TauriError>> =>
  invokeWrapped<DeleteLabelPayload>("delete_label", { args: { name } });
