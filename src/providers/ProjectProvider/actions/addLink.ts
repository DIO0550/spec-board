import { LinkIntent, TaskLinks } from "@/domains/task-links";
import { addLink as addLinkInvoke } from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import { ProjectState } from "../state/projectState";
import type { TaskActionDeps } from "./deps";
import {
  dispatchLinkOperations,
  findLinkTask,
  linkRejectReasonToError,
} from "./linkOperations";

/**
 * addLinkAction の引数。
 *
 * 他の task action（`updateTaskAction` / `deleteTaskAction` 等）と命名を揃えて
 * リンク元を `filePath` で受ける。IPC 呼出時には `addLinkInvoke` の引数
 * `{ sourceFilePath, targetFilePath }` に詰め替える（フィールド名は IPC 側と異なる）。
 */
export type AddLinkActionParams = {
  /** リンク元タスクの filePath（IPC 側では `sourceFilePath` に対応） */
  readonly filePath: string;
  /** リンク先タスクの filePath（`buildAddLinkCandidates` 由来の canonical 値） */
  readonly targetFilePath: string;
};

/**
 * 現在の active project の task に link を追加する。楽観・rollback の計算は
 * `TaskLinks.planAddLink` に集約し、本 action は 4 段 version 判定
 * （capture / preflight / IPC 後 / rollback 前）・IPC・dispatch の orchestration のみを担う。
 *
 * - plan が rejected（source 不在 / self-link / target 不在）→ IPC 前に `ProjectError`
 * - plan が noop（既リンク済み。正規化同値判定）→ IPC 前に現行 source で `Result.ok`
 * - 成功時: source は IPC 戻り値の canonical Task で再 dispatch、target は楽観値据え置き
 * - 失敗時: `plan.rollback`（inverse operations）を現在 state に適用し、
 *   自分が触れた path のみを元へ戻す（外部更新は保持）
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params link 元 / link 先 filePath
 * @returns 更新後の source Task または ProjectError
 */
export const addLinkAction = (
  deps: TaskActionDeps,
  params: AddLinkActionParams,
): Promise<ResultT<Task, ProjectError>> => {
  if (!ProjectState.canAcceptDataCommand(deps.getState())) {
    return Promise.resolve(Result.err(ProjectError.invalidState()));
  }

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectState.canAcceptDataCommand(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.projectSwitched());
    }

    /**
     * 現在 state から canonical 完全一致で Task を引き当てる lookup。
     * @param filePath 引き当てる filePath
     * @returns 該当 Task（不在なら undefined）
     */
    const findTaskInCurrentState = (filePath: string): Task | undefined =>
      findLinkTask(deps.getState(), filePath);

    const plan = TaskLinks.planAddLink(
      LinkIntent.forAdd({
        sourceFilePath: params.filePath,
        targetFilePath: params.targetFilePath,
        findTask: findTaskInCurrentState,
      }),
    );
    if (plan.kind === "rejected") {
      return Result.err(linkRejectReasonToError(plan.reason));
    }
    if (plan.kind === "noop") {
      return Result.ok(plan.task);
    }

    dispatchLinkOperations(deps, plan.optimistic);

    const result = await addLinkInvoke({
      sourceFilePath: params.filePath,
      targetFilePath: params.targetFilePath,
    });

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.projectSwitched());
    }

    if (!result.ok) {
      // 4 段目の version guard: IPC 後 check（上の guard）からここまでに同期実行のみ
      // で version 変化は起こり得ないが、「4 段 version 判定」の契約を文面通りに
      // 満たすため明示的に再 check する。version が進んでいたら他 project の
      // reducer を汚さないよう rollback dispatch ごと skip して invalid-state を返す。
      if (!isProjectCurrent(deps.projectVersion, version)) {
        return Result.err(ProjectError.projectSwitched());
      }
      dispatchLinkOperations(deps, plan.rollback);
      return Result.err(ProjectError.tauri(result.error));
    }

    deps.dispatch({
      type: "task-updated",
      originalFilePath: params.filePath,
      task: result.value,
    });
    return Result.ok(result.value);
  });
};
