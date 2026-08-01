import { MilestoneProjection } from "@/domains/milestone-projection";
import { ProjectLoadWarning } from "@/domains/project-load-warning";
import { TaskProjection } from "@/domains/task-projection";
import { WatcherSession } from "@/domains/watcher-session";
import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import type { GetTasksPayload, GetTasksRawPayload } from "../types";

/**
 * Tauri 生 payload を UI 層が扱う `GetTasksPayload` に変換する。
 * @param payload - Tauri から受け取った生 payload
 * @returns Task / projection ドメインに正規化済みの payload
 */
const toGetTasksPayload = (payload: GetTasksRawPayload): GetTasksPayload => ({
  tasks: payload.tasks.map(Task.fromPayload),
  projections: TaskProjection.fromPayload(payload.projections),
  milestoneProjections: MilestoneProjection.fromPayload(
    payload.milestoneProjections,
  ),
  loadWarnings: payload.loadWarnings.map(ProjectLoadWarning.fromPayload),
  session: WatcherSession.fromPayload(payload.session),
});

/**
 * 現在のプロジェクト内の全タスクと両 projection を取得する。
 * @returns 成功時は Result.ok(GetTasksPayload)、失敗時は Result.err(TauriError)
 */
export const getTasks = (): Promise<ResultT<GetTasksPayload, TauriError>> =>
  invokeWrapped<GetTasksRawPayload>("get_tasks").then((result) =>
    Result.map(result, toGetTasksPayload),
  );
