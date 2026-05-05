import {
  getColumns as getColumnsInvoke,
  updateColumns as updateColumnsInvoke,
} from "@/lib/tauri";
import { Result, type Result as ResultT } from "@/utils/result";
import {
  enqueueProjectCommand,
  isProjectCurrent,
  type ProjectCommandQueue,
  type ProjectVersion,
} from "../concurrency";
import {
  Columns,
  type UpdateColumnsCommand,
  type UpdateColumnsCommandBuilder,
} from "../domain/columns";
import type { ProjectData } from "../domain/projectData";
import { ProjectState } from "../domain/projectState";
import { ProjectError } from "../errors";
import type { ProjectAction, ProjectState as ProjectStateT } from "../reducer";

export type UpdateColumnsActionDeps = {
  projectVersion: ProjectVersion;
  projectCommandQueue: ProjectCommandQueue;
  getState: () => ProjectStateT;
  dispatchSync: (action: ProjectAction) => void;
};

/**
 * project 世代が変わったときに返す共通エラーを作成する。
 *
 * @returns applied=false ではなく stale command を表す invalid-state
 */
const switchedProject = (): ResultT<{ applied: boolean }, ProjectError> =>
  Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));

/**
 * column 更新 command を解決・検証し、Tauri update_columns と state 反映を直列実行する。
 *
 * @param deps column 更新に必要な queue / version / state / dispatch 依存
 * @param command 静的な column 更新命令、または最新 ProjectData から命令を作る builder
 * @returns invoke したかどうかを含む Result
 */
export const updateColumnsAction = (
  deps: UpdateColumnsActionDeps,
  command: UpdateColumnsCommand | UpdateColumnsCommandBuilder,
): Promise<ResultT<{ applied: boolean }, ProjectError>> => {
  if (!ProjectState.canAcceptDataCommand(deps.getState())) {
    return Promise.resolve(Result.err(ProjectError.invalidState()));
  }

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return switchedProject();
    }

    const visibleData = ProjectState.visibleData(deps.getState());
    if (visibleData === null) {
      return Result.err(ProjectError.invalidState());
    }

    let resolved = Columns.resolveCommand(command, visibleData);
    if (!resolved.ok) {
      return Result.err(resolved.error);
    }
    if (resolved.value === null) {
      return Result.ok({ applied: false });
    }

    let commandToApply = resolved.value;
    if (
      Columns.isDoneColumnSensitive(visibleData.columns, commandToApply) &&
      visibleData.doneColumn === undefined &&
      commandToApply.doneColumn === undefined
    ) {
      const refresh = await getColumnsInvoke();
      if (!isProjectCurrent(deps.projectVersion, version)) {
        return switchedProject();
      }
      if (!refresh.ok) {
        return Result.err(ProjectError.tauri(refresh.error));
      }

      const enrichedData: ProjectData = {
        ...visibleData,
        doneColumn: refresh.value.doneColumn,
      };
      deps.dispatchSync({
        type: "done-column-refreshed",
        doneColumn: refresh.value.doneColumn,
      });

      resolved = Columns.resolveCommand(command, enrichedData);
      if (!resolved.ok) {
        return Result.err(resolved.error);
      }
      if (resolved.value === null) {
        return Result.ok({ applied: false });
      }
      commandToApply = resolved.value;
    }

    const knownDoneColumn = ProjectState.visibleData(
      deps.getState(),
    )?.doneColumn;
    const validation = Columns.validateDoneColumn(
      knownDoneColumn,
      commandToApply,
    );
    if (!validation.ok) {
      return Result.err(validation.error);
    }

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return switchedProject();
    }

    const result = await updateColumnsInvoke({
      columns: commandToApply.columns,
      renames: commandToApply.renames,
      doneColumn: commandToApply.doneColumn,
    });
    if (!result.ok) {
      return Result.err(ProjectError.tauri(result.error));
    }
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return switchedProject();
    }

    deps.dispatchSync({
      type: "columns-replaced",
      columns: commandToApply.columns,
      renames: commandToApply.renames,
      doneColumn: commandToApply.doneColumn,
    });
    return Result.ok({ applied: true });
  });
};
