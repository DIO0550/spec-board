import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type {
  PreviewTaskFilenameParams,
  PreviewTaskFilenamePayload,
} from "../types";

/**
 * BE の `preview_task_filename` IPC を呼び出す。
 * @param params - プレビュー引数
 * @returns 成功時はプレビュー結果、失敗時は TauriError
 */
export const previewTaskFilename = (
  params: PreviewTaskFilenameParams,
): Promise<Result<PreviewTaskFilenamePayload, TauriError>> =>
  invokeWrapped<PreviewTaskFilenamePayload>("preview_task_filename", params);
