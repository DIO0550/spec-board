import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import type { CreateTaskParams } from "../types";

/**
 * 新規タスクの md ファイルを作成する。
 * @param params 作成パラメータ（title / status は必須、その他は任意）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const createTask = (
  params: CreateTaskParams,
): Promise<Result<Task, TauriError>> =>
  invokeWrapped<Task>("create_task", params);
