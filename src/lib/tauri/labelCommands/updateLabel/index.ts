import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { UpdateLabelArgs } from "../types";

/**
 * 既存ラベルの metadata を更新する（PUT セマンティクス・name は rename しない）。
 * 失敗時は書き込み失敗トースト（mutation 通知）の対象。
 * @param args 更新内容（全フィールド・未指定はクリア）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const updateLabel = (
  args: UpdateLabelArgs,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("update_label", { args });
