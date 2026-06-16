import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { CreateLabelArgs } from "../types";

/**
 * 新しいラベルを labels.yml に追記する。
 * 失敗時は書き込み失敗トースト（mutation 通知）の対象。
 * @param args 作成するラベルの属性
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const createLabel = (
  args: CreateLabelArgs,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("create_label", { args });
