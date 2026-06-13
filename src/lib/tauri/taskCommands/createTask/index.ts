import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import type { CreateTaskParams } from "../types";

/**
 * 新規タスクの md ファイルを作成する。
 * @param params 作成パラメータ（title / status は必須、その他は任意）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const createTask = (
  params: CreateTaskParams,
): Promise<ResultT<Task, TauriError>> =>
  invokeWrapped<TaskPayload>("create_task", { args: params }).then((result) =>
    Result.map(result, Task.fromPayload),
  );
