import { MilestoneProjection } from "@/domains/milestone-projection";
import { TaskProjection } from "@/domains/task-projection";
import { WatcherSession } from "@/domains/watcher-session";
import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import type {
  OpenProjectParams,
  OpenProjectPayload,
  OpenProjectRawPayload,
} from "../types";

/**
 * Tauri 生 payload を UI 層が扱う `OpenProjectPayload` に変換する。
 * @param payload Tauri から受け取った生 payload
 * @returns Task / projection ドメインに正規化済みの payload
 */
const toOpenProjectPayload = (
  payload: OpenProjectRawPayload,
): OpenProjectPayload => ({
  tasks: payload.tasks.map(Task.fromPayload),
  columns: payload.columns,
  projections: TaskProjection.fromPayload(payload.projections),
  milestoneProjections: MilestoneProjection.fromPayload(
    payload.milestoneProjections,
  ),
  session: WatcherSession.fromPayload(payload.session),
});

/**
 * プロジェクトディレクトリを開き、タスク・カラム名一覧を取得する。
 * @param params 引数オブジェクト
 * @returns 成功時は Result.ok(payload)、失敗時は Result.err(TauriError)
 */
export const openProject = (
  params: OpenProjectParams,
): Promise<ResultT<OpenProjectPayload, TauriError>> =>
  invokeWrapped<OpenProjectRawPayload>("open_project", params).then((result) =>
    Result.map(result, toOpenProjectPayload),
  );
