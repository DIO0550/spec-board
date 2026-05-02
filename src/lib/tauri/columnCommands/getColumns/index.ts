import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetColumnsPayload } from "../types";

/**
 * 現在のプロジェクトのカラム定義 / doneColumn を取得する。
 * @returns 成功時は Result.ok({columns, doneColumn})、失敗時は Result.err(TauriError)
 */
export const getColumns = (): Promise<Result<GetColumnsPayload, TauriError>> =>
  invokeWrapped<GetColumnsPayload>("get_columns");
