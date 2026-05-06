import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";
import type {
  OpenProjectParams,
  OpenProjectPayload,
  OpenProjectRawPayload,
} from "../types";

const toOpenProjectPayload = (
  payload: OpenProjectRawPayload,
): OpenProjectPayload => ({
  tasks: payload.tasks.map(Task.fromPayload),
  columns: payload.columns,
});

/**
 * プロジェクトディレクトリを開き、タスク・カラム名一覧を取得する。
 * @param params 引数オブジェクト
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const openProject = (
  params: OpenProjectParams,
): Promise<Result<OpenProjectPayload, TauriError>> =>
  invokeWrapped<OpenProjectRawPayload>("open_project", params).then((result) =>
    ResultDomain.map(result, toOpenProjectPayload),
  );
