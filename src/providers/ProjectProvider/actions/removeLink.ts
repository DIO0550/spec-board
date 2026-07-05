import { TaskLinks } from "@/domains/task-links";
import { removeLink as removeLinkInvoke } from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { PROJECT_SWITCHED_MESSAGE } from "../constants";
import { ProjectError } from "../errors";
import { ProjectState } from "../state/projectState";
import type { TaskActionDeps } from "./deps";

/**
 * removeLinkAction の引数。`addLinkAction` と命名を揃え、リンク元を `filePath` で受ける。
 * IPC 呼出時には `{ sourceFilePath, targetFilePath }` に詰め替える。
 */
export type RemoveLinkActionParams = {
  /** リンク元タスクの filePath（IPC 側では `sourceFilePath` に対応） */
  readonly filePath: string;
  /** リンク先タスクの filePath */
  readonly targetFilePath: string;
};

/**
 * filePath で現在の Task を visibleData から引き当てる。
 * @param state 現在の project state
 * @param filePath 引き当てる task の filePath
 * @returns 見つかれば Task、無ければ undefined
 */
const findCurrentTask = (
  state: ProjectState,
  filePath: string,
): Task | undefined =>
  ProjectState.visibleData(state)?.tasks.find(
    (task) => task.filePath === filePath,
  );

/**
 * 現在の active project の task から link を削除し、source/target 両方に楽観 dispatch
 * → IPC → 確定/条件付き rollback dispatch する。
 *
 * `addLinkAction` と同型の 4 段 version 判定（capture / preflight / IPC 後 / rollback 前）を備える。
 * BE の remove_link は source ファイルだけを disk に書き、target の reverse_links は
 * in-memory cache のみ更新 + IPC 戻り値は source `Task` を返す。そのため:
 *  - 成功時: source は IPC 戻り値の canonical Task で再 dispatch、target は楽観値据え置き
 *  - 失敗時: source / target 両方を `current.links == optimistic.links` の条件付きで snapshot に戻す
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params link 元 / link 先 filePath
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
      return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
    }

    const sourceSnap = findCurrentTask(deps.getState(), params.filePath);
    if (sourceSnap === undefined) {
      return Result.err(
        ProjectError.invalidState("リンク元のタスクが見つかりません"),
      );
    }
    // self-link (filePath === targetFilePath) は同一 Task に対する 2 段 dispatch だと
    // 2 回目が 1 回目を上書きして片方の楽観更新が失われる。同一 Task の場合は
    // linkedFilePaths と reverseLinkedFilePaths を 1 回の dispatch でまとめて更新する。
    const isSelfLink = params.filePath === params.targetFilePath;
    const targetSnap = isSelfLink
      ? undefined
      : findCurrentTask(deps.getState(), params.targetFilePath);

    const sourceForwardLinks = TaskLinks.removeLinkedFilePath(
      sourceSnap.links,
      params.targetFilePath,
    );
    const optimisticSourceLinks = isSelfLink
      ? TaskLinks.removeReverseLinkedFilePath(
          sourceForwardLinks,
          params.filePath,
        )
      : sourceForwardLinks;
    const optimisticSource: Task = {
      ...sourceSnap,
      links: optimisticSourceLinks,
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
        links: TaskLinks.removeReverseLinkedFilePath(
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

    const result = await removeLinkInvoke({
      sourceFilePath: params.filePath,
      targetFilePath: params.targetFilePath,
    });

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
    }

    if (!result.ok) {
      if (!isProjectCurrent(deps.projectVersion, version)) {
        return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
      }
      const currentSource = findCurrentTask(deps.getState(), params.filePath);
      if (currentSource !== undefined) {
        // self-link の場合は source 側で linkedFilePaths と reverseLinkedFilePaths の
        // 両方が楽観更新されているので、両 field を独立に still-optimistic 判定し
        // 戻せる方だけ snapshot に差し戻す。通常ケースでは reverse 判定は走らない。
        const forwardRestored =
          TaskLinks.restoreLinkedFilePathsIfStillOptimistic({
            snapshot: sourceSnap.links,
            optimistic: optimisticSource.links,
            current: currentSource.links,
          });
        const reverseRestored = isSelfLink
          ? TaskLinks.restoreReverseLinkedFilePathsIfStillOptimistic({
              snapshot: sourceSnap.links,
              optimistic: optimisticSource.links,
              current: currentSource.links,
            })
          : undefined;
        if (forwardRestored !== undefined || reverseRestored !== undefined) {
          const mergedLinks: TaskLinks = {
            linkedFilePaths:
              forwardRestored?.linkedFilePaths ??
              currentSource.links.linkedFilePaths,
            reverseLinkedFilePaths:
              reverseRestored?.reverseLinkedFilePaths ??
              currentSource.links.reverseLinkedFilePaths,
          };
          deps.dispatch({
            type: "task-updated",
            originalFilePath: params.filePath,
            task: { ...currentSource, links: mergedLinks },
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
