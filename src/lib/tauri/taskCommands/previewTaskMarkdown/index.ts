import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { PreviewTaskMarkdownParams } from "../types";

/**
 * BE の `preview_task_markdown` IPC を呼び出す。
 * @param params - Task Form の明示的な preview draft
 * @returns 成功時は BE が render した full markdown、失敗時は TauriError
 */
export const previewTaskMarkdown = (
  params: PreviewTaskMarkdownParams,
): Promise<Result<string, TauriError>> =>
  invokeWrapped<string>("preview_task_markdown", params);
