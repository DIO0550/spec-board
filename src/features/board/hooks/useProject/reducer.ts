import type { ColumnRename, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import {
  ProjectData as ProjectDataDomain,
  type ProjectData as ProjectDataT,
} from "./domain/projectData";
import {
  ProjectState as ProjectStateDomain,
  type ProjectState as ProjectStateT,
} from "./domain/projectState";

export type ProjectData = ProjectDataT;
export type ProjectState = ProjectStateT;

export type ProjectAction =
  | { type: "open-start"; path: string }
  | { type: "open-succeed"; path: string; data: ProjectData }
  | { type: "open-fail"; path: string; error: TauriError }
  | { type: "task-created"; task: Task }
  | { type: "task-updated"; originalFilePath: string; task: Task }
  | { type: "task-deleted"; filePath: string }
  | {
      type: "columns-replaced";
      columns: Column[];
      renames?: ColumnRename[];
      doneColumn?: string;
    }
  | { type: "done-column-refreshed"; doneColumn: string }
  | { type: "reset" };

export const initialState: ProjectState = ProjectStateDomain.initial;

/**
 * useProject の state transition を domain companion object に委譲して適用する。
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
      return ProjectStateDomain.openStart(state, action.path);
    case "open-succeed":
      return ProjectStateDomain.openSucceed(action.path, action.data);
    case "open-fail":
      return ProjectStateDomain.openFail(state, action.path, action.error);
    case "task-created":
      return ProjectStateDomain.updateData(state, (data) =>
        ProjectDataDomain.applyTaskCreated(data, action.task),
      );
    case "task-updated":
      return ProjectStateDomain.updateData(state, (data) =>
        ProjectDataDomain.applyTaskUpdated(
          data,
          action.originalFilePath,
          action.task,
        ),
      );
    case "task-deleted":
      return ProjectStateDomain.updateData(state, (data) =>
        ProjectDataDomain.applyTaskDeleted(data, action.filePath),
      );
    case "columns-replaced":
      return ProjectStateDomain.updateData(state, (data) =>
        ProjectDataDomain.replaceColumns(data, {
          columns: action.columns,
          renames: action.renames,
          doneColumn: action.doneColumn,
        }),
      );
    case "done-column-refreshed":
      return ProjectStateDomain.updateData(state, (data) =>
        ProjectDataDomain.refreshDoneColumn(data, action.doneColumn),
      );
    case "reset":
      return ProjectStateDomain.reset();
    default: {
      action satisfies never;
      return state;
    }
  }
};
