import { LinkIntent, TaskLinks } from "@/domains/task-links";
import { removeLink as removeLinkInvoke } from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import { ProjectState } from "../state/projectState";
import type { TaskActionDeps } from "./deps";
import {
  dispatchLinkOperations,
  findLinkTask,
  findLinkTaskByReference,
  linkRejectReasonToError,
} from "./linkOperations";

/**
 * removeLinkAction の引数。`addLinkAction` と命名を揃え、リンク元を `filePath` で受ける。
 * IPC 呼出時には `{ sourceFilePath, targetFilePath }` に詰め替える。
 */
export type RemoveLinkActionParams = {
  /** リンク元タスクの filePath（IPC 側では `sourceFilePath` に対応） */
  readonly filePath: string;
  /** 削除するリンクの raw 値（`linkedFilePaths` の要素。`./tasks/b.md` 等の表記揺れ可） */
  readonly targetFilePath: string;
};

/**
 * 現在の active project の task から link を削除する。楽観・rollback の計算は
 * `TaskLinks.planRemoveLink` に集約し、本 action は 4 段 version 判定
 * （capture / preflight / IPC 後 / rollback 前）・IPC・dispatch の orchestration のみを担う
 * （`addLinkAction` と対称）。
 *
 * - `targetFilePath` は raw 値のまま plan へ渡し、target Task は
 *   `findLinkTaskByReference`（`linkReferencesTaskPath` の表記揺れ吸収）で解決する
 *   （解決不能 = broken link なら undefined のまま plan が forward のみの apply を返す）
 * - plan が rejected（source 不在）→ IPC 前に `ProjectError`
 * - plan が noop（forward link 不在。正規化同値判定）→ IPC 前に現行 source で `Result.ok`
 * - self-link は plan が同一 filePath への 2 operations を返し、
 *   `dispatchLinkOperations` が 1 dispatch に併合する
 * - 成功時: source は IPC 戻り値の canonical Task で再 dispatch、target は楽観値据え置き
 * - 失敗時: `plan.rollback`（inverse operations）を現在 state に適用し、
 *   自分が触れた path のみを元位置へ best-effort で復元する（外部更新は保持）
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params link 元 filePath / 削除する raw 値
 * @returns 更新後の source Task または ProjectError
 */
export const removeLinkAction = (
  deps: TaskActionDeps,
  params: RemoveLinkActionParams,
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
    /**
     * 現在 state から raw 参照（表記揺れ込み）で Task を引き当てる lookup。
     * @param reference frontmatter 由来の raw 参照
     * @returns 該当 Task（解決不能 = broken link なら undefined）
     */
    const findTaskByReferenceInCurrentState = (
      reference: string,
    ): Task | undefined => findLinkTaskByReference(deps.getState(), reference);

    const plan = TaskLinks.planRemoveLink(
      LinkIntent.forRemove({
        sourceFilePath: params.filePath,
        targetFilePath: params.targetFilePath,
        findTask: findTaskInCurrentState,
        findTaskByReference: findTaskByReferenceInCurrentState,
      }),
    );
    if (plan.kind === "rejected") {
      return Result.err(linkRejectReasonToError(plan.reason));
    }
    if (plan.kind === "noop") {
      return Result.ok(plan.task);
    }

    dispatchLinkOperations(deps, plan.optimistic);

    const result = await removeLinkInvoke({
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
