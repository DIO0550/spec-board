import type { ProjectColumnRename } from "@/domains/project-columns";
import {
  ProjectData as ProjectDataDomain,
  type ProjectData as ProjectDataT,
} from "@/domains/project-data";
import type { Task } from "@/domains/task";
import type { TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import { ProjectState } from "./state/projectState";

export type ProjectData = ProjectDataT;

export type ProjectAction =
  | { type: "open-start"; path: string }
  | { type: "open-succeed"; path: string; data: ProjectData }
  | { type: "open-fail"; path: string; error: TauriError }
  | { type: "task-created"; task: Task }
  | { type: "task-updated"; originalFilePath: string; task: Task }
  | { type: "task-deleted"; filePath: string }
  // ProjectData 全体を snapshot で完全復元するための action。
  // 主に削除失敗時の rollback で使う (削除に伴い他 task の hierarchy / links /
  // reverseLinks も掃除されるため、task 単体差し替えでは戻しきれない)。
  // 他用途で使う際は ProjectData の不変条件を呼び出し側で保証すること。
  | { type: "state-replaced"; data: ProjectData }
  | {
      type: "columns-replaced";
      columns: Column[];
      renames?: ProjectColumnRename[];
      doneColumn?: string;
    }
  | { type: "done-column-refreshed"; doneColumn: string }
  | { type: "card-order-updated"; columnName: string; filePaths: string[] }
  | { type: "reset" };

export const initialState: ProjectState = ProjectState.initial;

/**
 * project の state transition を state companion と domain API に委譲して適用する。
 *
 * @param state 現在の ProjectState
 * @param action 適用する ProjectAction
 * @returns 次の ProjectState
 */
export const reducer = (
  state: ProjectState,
  action: ProjectAction,
): ProjectState => {
  switch (action.type) {
    case "open-start":
      return ProjectState.openStart(state, action.path);
    case "open-succeed":
      return ProjectState.openSucceed(action.path, action.data);
    case "open-fail":
      return ProjectState.openFail(state, action.path, action.error);
    case "task-created":
      return ProjectState.updateData(state, (data) =>
        ProjectDataDomain.applyTaskCreated(data, action.task),
      );
    case "task-updated":
      return ProjectState.updateData(state, (data) =>
        ProjectDataDomain.applyTaskUpdated(
          data,
          action.originalFilePath,
          action.task,
        ),
      );
    case "task-deleted":
      return ProjectState.updateData(state, (data) =>
        ProjectDataDomain.applyTaskDeleted(data, action.filePath),
      );
    case "state-replaced":
      return ProjectState.updateData(state, () => action.data);
    case "columns-replaced":
      return ProjectState.updateData(state, (data) =>
        ProjectDataDomain.replaceColumns(data, {
          columns: action.columns,
          renames: action.renames,
          doneColumn: action.doneColumn,
        }),
      );
    case "done-column-refreshed":
      return ProjectState.updateData(state, (data) =>
        ProjectDataDomain.refreshDoneColumn(data, action.doneColumn),
      );
    case "card-order-updated":
      return ProjectState.updateData(state, (data) =>
        ProjectDataDomain.applyCardOrderUpdated(
          data,
          action.columnName,
          action.filePaths,
        ),
      );
    case "reset":
      return ProjectState.reset();
    default: {
      action satisfies never;
      return state;
    }
  }
};
