import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetTaskTemplatesPayload } from "../types";

/**
 * `.spec-board/templates/*.md` 由来のタスクテンプレート一覧を取得する。
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const getTaskTemplates = (): Promise<
  Result<GetTaskTemplatesPayload, TauriError>
> => invokeWrapped<GetTaskTemplatesPayload>("get_task_templates");
