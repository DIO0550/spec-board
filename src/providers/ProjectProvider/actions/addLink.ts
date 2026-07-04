import { TaskLinks } from "@/domains/task-links";
import { addLink as addLinkInvoke } from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { PROJECT_SWITCHED_MESSAGE } from "../constants";
import { ProjectError } from "../errors";
import { ProjectState } from "../state/projectState";
import type { TaskActionDeps } from "./deps";

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
  /** リンク先タスクの filePath */
  readonly targetFilePath: string;
};

/** filePath で現在の Task を visibleData から引き当てる。 */
const findCurrentTask = (
  state: ProjectState,
  filePath: string,
): Task | undefined =>
  ProjectState.visibleData(state)?.tasks.find(
    (task) => task.filePath === filePath,
  );

/**
 * 現在の active project の task に link を追加し、source/target 両方に楽観 dispatch
 * → IPC → 確定/条件付き rollback dispatch する。
 *
 * `updateTaskAction` と同型の 4 段 version 判定（capture / preflight / IPC 後 / rollback 前）を備える。
 * BE の add_link は source ファイルだけを disk に書き、target の reverse_links は
 * in-memory cache のみ更新 + IPC 戻り値は source `Task` のみ返す。そのため:
 *  - 成功時: source は IPC 戻り値の canonical Task で再 dispatch、target は楽観値据え置き
 *  - 失敗時: source / target 両方を `current.links == optimistic.links` の条件付きで snapshot に戻す
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
      return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
    }

    const sourceSnap = findCurrentTask(deps.getState(), params.filePath);
    if (sourceSnap === undefined) {
      return Result.err(
        ProjectError.invalidState("リンク元のタスクが見つかりません"),
      );
    }
    const targetSnap = findCurrentTask(deps.getState(), params.targetFilePath);

    const optimisticSource: Task = {
      ...sourceSnap,
      links: TaskLinks.appendLinkedFilePath(
        sourceSnap.links,
        params.targetFilePath,
      ),
    };
    deps.dispatch({
      type: "task-updated",
      originalFilePath: params.filePath,
      task: optimisticSource,
    });

    let optimisticTarget: Task | undefined;
    if (targetSnap !== undefined) {
      optimisticTarget = {
        ...targetSnap,
        links: TaskLinks.appendReverseLinkedFilePath(
          targetSnap.links,
          params.filePath,
        ),
      };
      deps.dispatch({
        type: "task-updated",
        originalFilePath: params.targetFilePath,
        task: optimisticTarget,
      });
    }

    const result = await addLinkInvoke({
      sourceFilePath: params.filePath,
      targetFilePath: params.targetFilePath,
    });

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
    }

    if (!result.ok) {
      // 4 段目の version guard: IPC 後 check（上の guard）からここまでに同期実行のみ
      // で version 変化は起こり得ないが、計画書の「4 段 version 判定」の契約を
      // 文面通りに満たすため明示的に再 check する。version が進んでいたら他 project の
      // reducer を汚さないよう rollback dispatch ごと skip して invalid-state を返す。
      if (!isProjectCurrent(deps.projectVersion, version)) {
        return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
      }
      const currentSource = findCurrentTask(deps.getState(), params.filePath);
      if (currentSource !== undefined) {
        const restoredLinks = TaskLinks.restoreLinkedFilePathsIfStillOptimistic(
          {
            snapshot: sourceSnap.links,
            optimistic: optimisticSource.links,
            current: currentSource.links,
          },
        );
        if (restoredLinks !== undefined) {
          deps.dispatch({
            type: "task-updated",
            originalFilePath: params.filePath,
            task: { ...currentSource, links: restoredLinks },
          });
        }
      }

      if (targetSnap !== undefined && optimisticTarget !== undefined) {
        const currentTarget = findCurrentTask(
          deps.getState(),
          params.targetFilePath,
        );
        if (currentTarget !== undefined) {
          const restoredLinks =
            TaskLinks.restoreReverseLinkedFilePathsIfStillOptimistic({
              snapshot: targetSnap.links,
              optimistic: optimisticTarget.links,
              current: currentTarget.links,
            });
          if (restoredLinks !== undefined) {
            deps.dispatch({
              type: "task-updated",
              originalFilePath: params.targetFilePath,
              task: { ...currentTarget, links: restoredLinks },
            });
          }
        }
      }

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
