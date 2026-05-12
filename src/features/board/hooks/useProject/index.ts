import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  CreateTaskParams,
  DeleteTaskParams,
  UpdateTaskParams,
} from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
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
  invalidateOpenRequests,
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

  const loadedPath = state.kind === "loaded" ? state.path : null;
  useEffect(() => {
    if (loadedPath == null) {
      return;
    }
    let unlistened = false;
    let unlistenFn: UnlistenFn | null = null;
    const capturedPath = loadedPath;
    listen<{ task: TaskPayload }>("task-created", (event) => {
      const payload = event.payload;
      if (!payload?.task) {
        return;
      }
      const current = latestStateRef.current;
      if (current.kind !== "loaded" || current.path !== capturedPath) {
        return;
      }
      const task = Task.fromPayload(payload.task);
      dispatchSync({ type: "task-created", task });
    })
      .then((fn) => {
        if (unlistened) {
          fn();
          return;
        }
        unlistenFn = fn;
      })
      .catch(() => {
        // listen 登録自体が失敗した場合は購読を諦める。
        // 失敗は user action と紐づかないため onError で通知せず黙殺する。
      });
    return () => {
      unlistened = true;
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
  }, [loadedPath, dispatchSync]);

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
    invalidateOpenRequests(projectVersionRef.current);
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
