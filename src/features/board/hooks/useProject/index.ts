import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  CreateTaskParams,
  DeleteTaskParams,
  UpdateTaskParams,
} from "@/lib/tauri";
import type { Task } from "@/types/task";
import type { Result as ResultT } from "@/utils/result";
import { openProjectAction } from "./actions/openProject";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "./actions/tasks";
import { updateColumnsAction } from "./actions/updateColumns";
import {
  createProjectVersion,
  deactivateProject,
  invalidateProject,
  type ProjectCommandQueue,
} from "./concurrency";
import type { ProjectError } from "./errors";
import {
  initialState,
  type ProjectAction,
  type ProjectState,
  reducer,
} from "./reducer";
import type {
  ColumnsCommand,
  ColumnsCommandBuilder,
  UseProjectOptions,
  UseProjectResult,
} from "./types";

export type { ProjectError } from "./errors";
export type { ProjectData, ProjectState } from "./reducer";
export type {
  ColumnsCommand,
  ColumnsCommandBuilder,
  UpdateColumnsInput,
  UseProjectOptions,
  UseProjectResult,
} from "./types";

/**
 * project lifecycle と task / column command を提供する board 用 hook。
 *
 * @param options openProject 系 error の通知 callback などの hook option
 * @returns board が利用する state と project command API
 */
export const useProject = (
  options: UseProjectOptions = {},
): UseProjectResult => {
  const { onError } = options;
  const [state, dispatch] = useReducer(reducer, initialState);

  const latestStateRef = useRef<ProjectState>(state);
  const projectVersionRef = useRef(createProjectVersion());
  const projectCommandQueueRef = useRef<ProjectCommandQueue>({
    current: Promise.resolve(),
  });
  const dialogOpeningRef = useRef(false);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      deactivateProject(projectVersionRef.current);
    };
  }, []);

  const getState = useCallback((): ProjectState => latestStateRef.current, []);

  const dispatchSync = useCallback((action: ProjectAction): void => {
    latestStateRef.current = reducer(latestStateRef.current, action);
    dispatch(action);
  }, []);

  const openProject = useCallback(
    (): Promise<void> =>
      openProjectAction({
        projectVersion: projectVersionRef.current,
        projectCommandQueue: projectCommandQueueRef.current,
        dialogOpening: dialogOpeningRef,
        dispatchSync,
        onError,
      }),
    [dispatchSync, onError],
  );

  const actionDeps = useCallback(
    () => ({
      projectVersion: projectVersionRef.current,
      projectCommandQueue: projectCommandQueueRef.current,
      getState,
      dispatchSync,
    }),
    [dispatchSync, getState],
  );

  const createTask = useCallback(
    (params: CreateTaskParams): Promise<ResultT<Task, ProjectError>> =>
      createTaskAction(actionDeps(), params),
    [actionDeps],
  );

  const updateTask = useCallback(
    (params: UpdateTaskParams): Promise<ResultT<Task, ProjectError>> =>
      updateTaskAction(actionDeps(), params),
    [actionDeps],
  );

  const deleteTask = useCallback(
    (params: DeleteTaskParams): Promise<ResultT<void, ProjectError>> =>
      deleteTaskAction(actionDeps(), params),
    [actionDeps],
  );

  const updateColumns = useCallback(
    (
      command: ColumnsCommand | ColumnsCommandBuilder,
    ): Promise<ResultT<{ applied: boolean }, ProjectError>> =>
      updateColumnsAction(actionDeps(), command),
    [actionDeps],
  );

  const reset = useCallback((): void => {
    invalidateProject(projectVersionRef.current);
    dispatchSync({ type: "reset" });
  }, [dispatchSync]);

  return {
    state,
    openProject,
    createTask,
    updateTask,
    deleteTask,
    updateColumns,
    reset,
  };
};
