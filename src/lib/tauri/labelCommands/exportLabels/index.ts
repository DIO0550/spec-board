import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { ExportLabelsArgs } from "../types";

/**
 * 現在のラベルマスタを指定パスへ labels.yml 形式で書き出す。
 * BE が `serde_yaml_ng::to_string` で直列化するため store と同一形式になる。
 * 失敗時は書き込み失敗トースト（mutation 通知）の対象。
 * @param args 保存先パス
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const exportLabels = (
  args: ExportLabelsArgs,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("export_labels", { args });
