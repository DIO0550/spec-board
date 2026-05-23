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
import type { ProjectAction, ProjectState as ProjectStateT } from "../reducer";
import { ProjectSessionState } from "../state/projectSessionState";

export type TaskActionDeps = {
  projectVersion: ProjectVersion;
  projectCommandQueue: ProjectCommandQueue;
  /** 最新の project state を返す getter。 */
  getState: () => ProjectStateT;
  /**
   * reducer に同期的に action を投げる dispatcher。
   * @param action 反映する ProjectAction
   */
  dispatchSync: (action: ProjectAction) => void;
};

/**
 * task command を受け付けられる data state か事前検証する。
 *
 * @param deps 最新 state を読むための依存
 * @returns loaded / loading.previousLoaded なら ok、未 open なら invalid-state
 */
const ensureLoaded = <T>({
  getState,
}: Pick<TaskActionDeps, "getState">): ResultT<T, ProjectError> => {
  if (!ProjectSessionState.canAcceptDataCommand(getState())) {
    return Result.err(ProjectError.invalidState());
  }
  return Result.ok(undefined as T);
};

/**
 * 現在の active project に task を作成し、成功時に reducer へ反映する。
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params create_task に渡す作成パラメータ
 * @returns 作成結果または ProjectError
 */
export const createTaskAction = (
  deps: TaskActionDeps,
  params: CreateTaskParams,
): Promise<ResultT<Task, ProjectError>> => {
  const preflight = ensureLoaded<Task>(deps);
  if (!preflight.ok) {
    return Promise.resolve(preflight);
  }

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectSessionState.canAcceptDataCommand(deps.getState()) ||
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

/**
 * UpdateTaskParams のうち、Task に flat に写像できる楽観更新対象キー。
 *
 * - `parent` は除外: Task 側で hierarchy.parentFilePath にネストされ、親側
 *   hierarchy.childFilePaths にも波及するため、楽観構築コストが見合わない
 *   （BE 確定 dispatch まで反映を待つ）。
 * - `filePath` は lookup key で本体ではないため除外。
 */
const OPTIMISTIC_FIELDS = [
  "title",
  "status",
  "priority",
  "labels",
  "body",
] as const;
type OptimisticField = (typeof OPTIMISTIC_FIELDS)[number];

/**
 * `Object.prototype.hasOwnProperty.call` の薄いラッパ。
 * `Object.hasOwn` は ES2022 で tsconfig の `lib: ES2020` だと型エラーになるため避ける。
 *
 * @param obj 検査対象のオブジェクト
 * @param key 自身のプロパティかを判定するキー名
 * @returns obj 自身がキーを保有していれば true
 */
const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

/**
 * params に実際に含まれている楽観更新対象キーだけを抽出する。
 *
 * BE `UpdateTaskArgs` の各フィールドは `Option<T>` で `None = 不変` のため、
 * 明示的に `undefined` を渡しても BE 側は反応しない。楽観 dispatch だけが
 * `undefined` を Task に混入させると確定 dispatch で元値に戻り flicker するため、
 * 全フィールドで `undefined` を楽観対象から除外する。
 */
const pickOptimisticKeys = (
  params: UpdateTaskParams,
): readonly OptimisticField[] =>
  OPTIMISTIC_FIELDS.filter((key) => {
    if (!hasOwn(params, key)) {return false;}
    if (params[key] === undefined) {return false;}
    return true;
  });

/**
 * snapshot に対し、抽出済みの楽観対象キーだけを params の値で上書きした Task を作る。
 */
const buildOptimisticTask = (
  current: Task,
  params: UpdateTaskParams,
  keys: readonly OptimisticField[],
): Task => {
  const overrides: Partial<Task> = {};
  for (const key of keys) {
    // biome-ignore lint/suspicious/noExplicitAny: Task / UpdateTaskParams の key 単位 copy
    (overrides as any)[key] = (params as any)[key];
  }
  return { ...current, ...overrides };
};

/** filePath で現在の Task を visibleData から引き当てる。 */
const findCurrentTask = (
  state: ProjectStateT,
  filePath: string,
): Task | undefined =>
  ProjectSessionState.visibleData(state)?.tasks.find(
    (task) => task.filePath === filePath,
  );

/** 配列の浅い等値（同 reference または順序付き値一致）。labels 比較用。 */
const arrayShallowEq = (
  a: readonly string[],
  b: readonly string[],
): boolean =>
  a === b || (a.length === b.length && a.every((v, i) => v === b[i]));

/** 1 キー単位で「現在値 === 楽観値」かを判定する。 */
const isKeyStillOptimistic = (
  current: Task,
  optimistic: Task,
  key: OptimisticField,
): boolean => {
  if (key === "labels") {return arrayShallowEq(current.labels, optimistic.labels);}
  return current[key] === optimistic[key];
};

/**
 * 失敗 rollback dispatch 用に、current ベースで「楽観値そのままのキーだけ snapshot 値に戻した」
 * task を組み立てる。外部 listener が触った他キーは current のまま保護する。
 * 全キーが既に外部更新済みなら undefined を返し、rollback dispatch を完全 skip する。
 */
const buildRollbackTask = (
  current: Task,
  optimistic: Task,
  snapshot: Task,
  keys: readonly OptimisticField[],
): Task | undefined => {
  const overrides: Partial<Task> = {};
  let anyRestored = false;
  for (const key of keys) {
    if (isKeyStillOptimistic(current, optimistic, key)) {
      // biome-ignore lint/suspicious/noExplicitAny: Task の key 単位 copy
      (overrides as any)[key] = (snapshot as any)[key];
      anyRestored = true;
    }
  }
  return anyRestored ? { ...current, ...overrides } : undefined;
};

/**
 * 現在の active project の task を更新し、楽観 dispatch → IPC → 確定/rollback dispatch
 * 構造で reducer に反映する。
 *
 * 楽観反映の対象は `OPTIMISTIC_FIELDS`（title / status / priority / labels / body）のみ。
 * `parent` は hierarchy ネストのため BE 確定まで触らない。
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params update_task に渡す更新パラメータ
 * @returns 更新結果または ProjectError
 */
export const updateTaskAction = (
  deps: TaskActionDeps,
  params: UpdateTaskParams,
): Promise<ResultT<Task, ProjectError>> => {
  const preflight = ensureLoaded<Task>(deps);
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

    const snapshot = findCurrentTask(deps.getState(), params.filePath);
    if (snapshot === undefined) {
      return Result.err(
        ProjectError.invalidState("更新対象のタスクが見つかりません"),
      );
    }
    const optimisticKeys = pickOptimisticKeys(params);
    const optimisticTask = buildOptimisticTask(
      snapshot,
      params,
      optimisticKeys,
    );

    if (optimisticKeys.length > 0) {
      deps.dispatchSync({
        type: "task-updated",
        originalFilePath: params.filePath,
        task: optimisticTask,
      });
    }

    const result = await updateTaskInvoke(params);

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(
        ProjectError.invalidState("プロジェクトが切り替わりました"),
      );
    }

    if (!result.ok) {
      if (optimisticKeys.length > 0) {
        const current = findCurrentTask(deps.getState(), params.filePath);
        if (current !== undefined) {
          const rollbackTask = buildRollbackTask(
            current,
            optimisticTask,
            snapshot,
            optimisticKeys,
          );
          if (rollbackTask !== undefined) {
            deps.dispatchSync({
              type: "task-updated",
              originalFilePath: params.filePath,
              task: rollbackTask,
            });
          }
        }
      }
      return Result.err(ProjectError.tauri(result.error));
    }

    deps.dispatchSync({
      type: "task-updated",
      originalFilePath: params.filePath,
      task: result.value,
    });
    return Result.ok(result.value);
  });
};

/**
 * 現在の active project の task を削除し、成功時に reducer へ反映する。
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params delete_task に渡す削除パラメータ
 * @returns 削除結果または ProjectError
 */
export const deleteTaskAction = (
  deps: TaskActionDeps,
  params: DeleteTaskParams,
): Promise<ResultT<void, ProjectError>> => {
  const preflight = ensureLoaded<void>(deps);
  if (!preflight.ok) {
    return Promise.resolve(preflight);
  }

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectSessionState.canAcceptDataCommand(deps.getState()) ||
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
