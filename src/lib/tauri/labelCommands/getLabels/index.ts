import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetLabelsPayload } from "../types";

/**
 * 現在のプロジェクトのラベルマスタ定義一覧を取得する。
 * labels.yml 不在時は空配列（暗黙ラベル）。読み取り系 command のため
 * 失敗時に書き込み失敗トースト（mutation 通知）の対象にはしない。
 * @returns 成功時は Result.ok({labels})、失敗時は Result.err(TauriError)
 */
export const getLabels = (): Promise<Result<GetLabelsPayload, TauriError>> =>
  invokeWrapped<GetLabelsPayload>("get_labels");
