import { updateCardOrder, updateTask } from "@/lib/tauri";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import { ProjectSessionState } from "../state/projectSessionState";
import { buildMovedFilePaths } from "./buildMovedFilePaths";
import type { TaskActionDeps } from "./tasks";

/** moveTask が受け取るパラメータ。 */
export type MoveTaskParams = {
  readonly taskFilePath: string;
  readonly fromColumn: string;
  readonly toColumn: string;
  readonly toIndex: number;
};

/**
 * task command を受け付けられる data state か事前検証する。
 *
 * @param deps 最新 state を読むための依存
 * @returns loaded / loading.previousLoaded なら ok、未 open なら invalid-state
 */
const ensureLoaded = (
  deps: Pick<TaskActionDeps, "getState">,
): ResultT<void, ProjectError> =>
  ProjectSessionState.canAcceptDataCommand(deps.getState())
    ? Result.ok(undefined)
    : Result.err(ProjectError.invalidState());

/**
 * Drop 確定時に Board から呼ばれる単一 entry point。
 * - fromColumn !== toColumn: updateTask + updateCardOrder(toColumn) の 2 連 IPC
 * - fromColumn === toColumn: 並び替え後 filePaths と現状を比較し、変化なしなら no-op
 *                            変化あれば updateCardOrder のみ
 *
 * @param deps queue / version / state / dispatch 依存
 * @param params 移動パラメータ
 * @returns 成功時 Result.ok(undefined) / 失敗時 Result.err(ProjectError)
 */
export const moveTaskAction = (
  deps: TaskActionDeps,
  params: MoveTaskParams,
): Promise<ResultT<void, ProjectError>> => {
  const preflight = ensureLoaded(deps);
  if (!preflight.ok) {
    return Promise.resolve(preflight);
  }

  const version = deps.projectVersion.current;

  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectSessionState.canAcceptDataCommand(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(
        ProjectError.invalidState("プロジェクトが切り替わりました"),
      );
    }

    const data = ProjectSessionState.visibleData(deps.getState());
    if (data === null) {
      return Result.err(
        ProjectError.invalidState("プロジェクトが開かれていません"),
      );
    }

    const target = data.tasks.find((t) => t.filePath === params.taskFilePath);
    if (!target) {
      return Result.err(
        ProjectError.invalidState("対象のタスクが見つかりません"),
      );
    }
    if (target.status !== params.fromColumn) {
      return Result.err(
        ProjectError.invalidState(
          "タスクの状態が変わったためやり直してください",
        ),
      );
    }
    if (!data.columns.some((c) => c.name === params.toColumn)) {
      return Result.err(
        ProjectError.invalidState("移動先カラムが見つかりません"),
      );
    }

    if (params.fromColumn !== params.toColumn) {
      const updateResult = await updateTask({
        filePath: params.taskFilePath,
        status: params.toColumn,
      });
      if (!updateResult.ok) {
        return Result.err(ProjectError.tauri(updateResult.error));
      }
      if (!isProjectCurrent(deps.projectVersion, version)) {
        return Result.err(
          ProjectError.invalidState("プロジェクトが切り替わりました"),
        );
      }
      deps.dispatchSync({
        type: "task-updated",
        originalFilePath: params.taskFilePath,
        task: updateResult.value,
      });

      const latestData = ProjectSessionState.visibleData(deps.getState());
      const filePaths = buildMovedFilePaths(
        latestData?.tasks ?? [],
        params.taskFilePath,
        params.fromColumn,
        params.toColumn,
        params.toIndex,
      );
      const orderResult = await updateCardOrder({
        columnName: params.toColumn,
        filePaths,
      });
      if (!orderResult.ok) {
        return Result.err(ProjectError.tauri(orderResult.error));
      }
      if (!isProjectCurrent(deps.projectVersion, version)) {
        return Result.err(
          ProjectError.invalidState("プロジェクトが切り替わりました"),
        );
      }
      deps.dispatchSync({
        type: "card-order-updated",
        columnName: params.toColumn,
        filePaths,
      });
      return Result.ok(undefined);
    }

    const currentFilePaths = data.tasks
      .filter((t) => t.status === params.toColumn)
      .map((t) => t.filePath);
    const filePaths = buildMovedFilePaths(
      data.tasks,
      params.taskFilePath,
      params.fromColumn,
      params.toColumn,
      params.toIndex,
    );
    if (
      filePaths.length === currentFilePaths.length &&
      filePaths.every((p, i) => p === currentFilePaths[i])
    ) {
      return Result.ok(undefined);
    }

    const orderResult = await updateCardOrder({
      columnName: params.toColumn,
      filePaths,
    });
    if (!orderResult.ok) {
      return Result.err(ProjectError.tauri(orderResult.error));
    }
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(
        ProjectError.invalidState("プロジェクトが切り替わりました"),
      );
    }
    deps.dispatchSync({
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths,
    });
    return Result.ok(undefined);
  });
};
