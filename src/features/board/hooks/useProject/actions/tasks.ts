import {
  type CreateTaskParams,
  createTask as createTaskInvoke,
  type DeleteTaskParams,
  deleteTask as deleteTaskInvoke,
  type UpdateTaskParams,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import {
  enqueueProjectCommand,
  isProjectCurrent,
  type ProjectCommandQueue,
  type ProjectVersion,
} from "../concurrency";
import { ProjectError } from "../errors";
import { ProjectState } from "../domain/projectState";
import type { ProjectAction, ProjectState as ProjectStateT } from "../reducer";

export type TaskActionDeps = {
  projectVersion: ProjectVersion;
  projectCommandQueue: ProjectCommandQueue;
  getState: () => ProjectStateT;
  dispatchSync: (action: ProjectAction) => void;
};

const ensureLoaded = <T>({
  getState,
}: Pick<TaskActionDeps, "getState">): ResultT<T, ProjectError> => {
  if (!ProjectState.canAcceptCrud(getState())) {
    return Result.err(ProjectError.invalidState());
  }
  return Result.ok(undefined as T);
};

export const createTaskAction = (
  deps: TaskActionDeps,
  params: CreateTaskParams,
): Promise<ResultT<Task, ProjectError>> => {
  const preflight = ensureLoaded<Task>(deps);
  if (!preflight.ok) return Promise.resolve(preflight);

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectState.canAcceptCrud(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));
    }

    const result = await createTaskInvoke(params);
    if (!result.ok) {
      return Result.err(ProjectError.tauri(result.error));
    }
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));
    }
    deps.dispatchSync({ type: "task-created", task: result.value });
    return Result.ok(result.value);
  });
};

export const updateTaskAction = (
  deps: TaskActionDeps,
  params: UpdateTaskParams,
): Promise<ResultT<Task, ProjectError>> => {
  const preflight = ensureLoaded<Task>(deps);
  if (!preflight.ok) return Promise.resolve(preflight);

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectState.canAcceptCrud(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));
    }

    const result = await updateTaskInvoke(params);
    if (!result.ok) {
      return Result.err(ProjectError.tauri(result.error));
    }
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));
    }
    deps.dispatchSync({
      type: "task-updated",
      originalFilePath: params.filePath,
      task: result.value,
    });
    return Result.ok(result.value);
  });
};

export const deleteTaskAction = (
  deps: TaskActionDeps,
  params: DeleteTaskParams,
): Promise<ResultT<void, ProjectError>> => {
  const preflight = ensureLoaded<void>(deps);
  if (!preflight.ok) return Promise.resolve(preflight);

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectState.canAcceptCrud(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));
    }

    const result = await deleteTaskInvoke(params);
    if (!result.ok) {
      return Result.err(ProjectError.tauri(result.error));
    }
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));
    }
    deps.dispatchSync({ type: "task-deleted", filePath: params.filePath });
    return Result.ok(undefined);
  });
};
