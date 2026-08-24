import {
  type ArchiveTaskParams,
  archiveTask as archiveTaskInvoke,
  type CreateTaskParams,
  createTask as createTaskInvoke,
  type DeleteTaskParams,
  deleteTask as deleteTaskInvoke,
  type UpdateTaskParams,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import type { Task, TaskFilePath } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import { ProjectState } from "../state/projectState";
import type { TaskActionDeps } from "./deps";

/**
 * task command を受け付けられる data state か事前検証する。
 *
 * @param deps 最新 state を読むための依存
 * @returns loaded / loading.previousLoaded なら ok、未 open なら invalid-state
 */
const ensureLoaded = <T>({
  getState,
}: Pick<TaskActionDeps, "getState">): ResultT<T, ProjectError> => {
  if (!ProjectState.canAcceptDataCommand(getState())) {
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
      !ProjectState.canAcceptDataCommand(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.projectSwitched());
    }

    const result = await createTaskInvoke(params);
    if (!result.ok) {
      return Result.err(ProjectError.tauri(result.error));
    }
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.projectSwitched());
    }
    deps.dispatch({ type: "task-created", task: result.value });
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
    if (!hasOwn(params, key)) {
      return false;
    }
    if (params[key] === undefined) {
      return false;
    }
    return true;
  });

/**
 * params の指定キー 1 つを task に楽観反映する pure helper。
 * `pickOptimisticKeys` が `undefined` 除外済みである前提のもとで type narrowing する。
 *
 * @param task 反映対象の Task
 * @param params 更新パラメータ
 * @param key 反映するキー
 * @returns key を params の値で上書きした新 Task
 */
const applyOptimisticField = (
  task: Task,
  params: UpdateTaskParams,
  key: OptimisticField,
): Task => {
  switch (key) {
    case "title":
      return params.title !== undefined
        ? { ...task, title: params.title }
        : task;
    case "status":
      return params.status !== undefined
        ? { ...task, status: params.status }
        : task;
    case "priority":
      return params.priority !== undefined
        ? { ...task, priority: params.priority }
        : task;
    case "labels":
      return params.labels !== undefined
        ? { ...task, labels: params.labels }
        : task;
    case "body":
      return params.body !== undefined
        ? { ...task, body: params.body }
        : task;
  }
};

/**
 * snapshot に対し、抽出済みの楽観対象キーだけを params の値で上書きした Task を作る。
 *
 * @param current ベースとなる現在 Task（snapshot）
 * @param params 更新パラメータ
 * @param keys 反映するキー集合（`pickOptimisticKeys` で抽出済み）
 * @returns 楽観反映後の Task
 */
const buildOptimisticTask = (
  current: Task,
  params: UpdateTaskParams,
  keys: readonly OptimisticField[],
): Task => keys.reduce((task, key) => applyOptimisticField(task, params, key), current);

/** filePath で現在の Task を visibleData から引き当てる。 */
const findCurrentTask = (
  state: ProjectState,
  filePath: TaskFilePath,
): Task | undefined =>
  ProjectState.visibleData(state)?.tasks.find(
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
  if (key === "labels") {
    return arrayShallowEq(current.labels, optimistic.labels);
  }
  return current[key] === optimistic[key];
};

/**
 * 指定キー 1 つを snapshot 値で task に戻す pure helper。
 *
 * @param task ベースとなる現在 Task
 * @param snapshot 反映する snapshot Task
 * @param key 戻すキー
 * @returns key を snapshot の値に戻した新 Task
 */
const applySnapshotField = (
  task: Task,
  snapshot: Task,
  key: OptimisticField,
): Task => {
  switch (key) {
    case "title":
      return { ...task, title: snapshot.title };
    case "status":
      return { ...task, status: snapshot.status };
    case "priority":
      return { ...task, priority: snapshot.priority };
    case "labels":
      return { ...task, labels: snapshot.labels };
    case "body":
      return { ...task, body: snapshot.body };
  }
};

/**
 * 失敗 rollback dispatch 用に、current ベースで「楽観値そのままのキーだけ snapshot 値に戻した」
 * task を組み立てる。外部 listener が触った他キーは current のまま保護する。
 * 全キーが既に外部更新済みなら undefined を返し、rollback dispatch を完全 skip する。
 *
 * @param current rollback 直前の最新 Task
 * @param optimistic 楽観 dispatch で流した Task
 * @param snapshot 楽観前の snapshot Task
 * @param keys 楽観対象キー集合
 * @returns rollback 用 Task。全キー既に外部更新済みなら undefined
 */
const buildRollbackTask = (
  current: Task,
  optimistic: Task,
  snapshot: Task,
  keys: readonly OptimisticField[],
): Task | undefined => {
  const restoreKeys = keys.filter((key) =>
    isKeyStillOptimistic(current, optimistic, key),
  );
  if (restoreKeys.length === 0) {
    return undefined;
  }
  return restoreKeys.reduce(
    (task, key) => applySnapshotField(task, snapshot, key),
    current,
  );
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
      !ProjectState.canAcceptDataCommand(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.projectSwitched());
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
      deps.dispatch({
        type: "task-updated",
        originalFilePath: params.filePath,
        task: optimisticTask,
      });
    }

    const result = await updateTaskInvoke(params);

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.projectSwitched());
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
            deps.dispatch({
              type: "task-updated",
              originalFilePath: params.filePath,
              task: rollbackTask,
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

/**
 * 現在の active project の task をアーカイブし、成功時に reducer へ反映する。
 *
 * board / cache から見た効果は削除と同じ（task-deleted）で、rollback も
 * `deleteTaskAction` と同じ ProjectData snapshot 復元方式を使う。
 *
 * @param deps task action に必要な queue / version / state / dispatch 依存
 * @param params archive_task に渡すパラメータ
 * @returns アーカイブ結果または ProjectError
 */
export const archiveTaskAction = (
  deps: TaskActionDeps,
  params: ArchiveTaskParams,
): Promise<ResultT<void, ProjectError>> => {
  const preflight = ensureLoaded<void>(deps);
  if (!preflight.ok) {
    return Promise.resolve(preflight);
  }

  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (
      !ProjectState.canAcceptDataCommand(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.projectSwitched());
    }

    // rollback 用 snapshot（削除と同じ理由で ProjectData 単位で採取する）。
    const snapshot = ProjectState.visibleData(deps.getState());
    const hasTarget =
      snapshot !== null &&
      snapshot.tasks.some((t) => t.filePath === params.filePath);

    if (hasTarget) {
      deps.dispatch({ type: "task-deleted", filePath: params.filePath });
    }

    const result = await archiveTaskInvoke(params);

    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.projectSwitched());
    }

    if (!result.ok) {
      if (hasTarget && snapshot !== null) {
        deps.dispatch({ type: "state-replaced", data: snapshot });
      }
      return Result.err(ProjectError.tauri(result.error));
    }

    // 確定 dispatch は楽観 dispatch を skip した経路のみ。`applyTaskDeleted` は
    // 対象が既に無くても tasks を作り直すため、二重 dispatch すると参照が毎回
    // 変わり、bulk アーカイブで不要な再レンダー・projection 再同期を誘発する。
    if (!hasTarget) {
      deps.dispatch({ type: "task-deleted", filePath: params.filePath });
    }
    return Result.ok(undefined);
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
      !ProjectState.canAcceptDataCommand(deps.getState()) ||
      !isProjectCurrent(deps.projectVersion, version)
    ) {
      return Result.err(ProjectError.projectSwitched());
    }

    // ProjectData 全体を snapshot として採取する。
    // 削除で掃除される他 task の hierarchy / links / reverseLinks も含めて
    // rollback で完全復元したいので、task 単体ではなく ProjectData 単位で取る。
    // visibleData は loaded / loading.previousLoaded 以外では null を返す契約。
    const snapshot = ProjectState.visibleData(deps.getState());
    const hasTarget =
      snapshot !== null &&
      snapshot.tasks.some((t) => t.filePath === params.filePath);

    if (hasTarget) {
      deps.dispatch({ type: "task-deleted", filePath: params.filePath });
    }

    const result = await deleteTaskInvoke(params);

    if (!isProjectCurrent(deps.projectVersion, version)) {
      // project が切り替わった場合は rollback dispatch も skip する。
      // 通知抑止と rollback skip を分離せず、両方とも skip する方針。
      return Result.err(ProjectError.projectSwitched());
    }

    if (!result.ok) {
      // 失敗 rollback: 楽観 dispatch を行った場合のみ snapshot 全体で復元する。
      if (hasTarget && snapshot !== null) {
        deps.dispatch({ type: "state-replaced", data: snapshot });
      }
      return Result.err(ProjectError.tauri(result.error));
    }

    // 確定 dispatch (冪等)。楽観 dispatch を skip した経路でも常に発火する。
    deps.dispatch({ type: "task-deleted", filePath: params.filePath });
    return Result.ok(undefined);
  });
};
