import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import type { MoveTaskParams } from "../types";

/**
 * タスクの status 変更と cardOrder 更新を単一コマンドで行う。
 *
 * 同一カラム並び替え（fromColumn === toColumn）では status を変更せず
 * cardOrder のみ更新される。
 *
 * @param params 移動パラメータ（移動先カラムの並びは FE が算出した完全な配列）
 * @returns 成功時は Result.ok(Task)、失敗時は Result.err(TauriError)
 */
export const moveTask = (
  params: MoveTaskParams,
): Promise<ResultT<Task, TauriError>> =>
  invokeWrapped<TaskPayload>("move_task", { args: params }).then((result) =>
    Result.map(result, Task.fromPayload),
  );
