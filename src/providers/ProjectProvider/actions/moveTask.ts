import type { Task } from "@/domains/task";
import { updateCardOrder, updateTask } from "@/lib/tauri";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import type { ProjectAction, ProjectData } from "../reducer";
import { ProjectState } from "../state/projectState";
import { buildMovedFilePaths } from "./buildMovedFilePaths";
import type { TaskActionDeps } from "./deps";

/** moveTask が受け取るパラメータ。 */
export type MoveTaskParams = {
  readonly taskFilePath: string;
  readonly fromColumn: string;
  readonly toColumn: string;
  readonly toIndex: number;
};

/**
 * moveTask の楽観 dispatch / rollback 発生を呼び出し側に通知する callback。
 * 通知は IPC 結果を待たず、reducer 反映直後に呼ばれる。callback 例外は
 * 内部で握り潰し queue 進行に影響させない。
 */
export type MoveTaskCallbacks = {
  /**
   * カラム間 status 変更（fromColumn !== toColumn）の楽観 dispatch が
   * reducer に反映された直後に 1 度だけ呼ばれる。同一カラム並び替え
   * （fromColumn === toColumn）では呼ばれない。preflight 失敗（target 消失 /
   * status 乖離 / toColumn 不存在 / 開始前 version 切替）でも呼ばれない。
   */
  readonly onOptimisticApplied?: (params: {
    taskFilePath: string;
    fromColumn: string;
    toColumn: string;
  }) => void;
  /**
   * カラム間 status 変更の updateTask 失敗による rollback が完了した直後に
   * 1 度だけ呼ばれる。同一カラム rollback / partial-move（status 確定保持）
   * / projectVersion 不一致による invalid-state では呼ばれない。
   */
  readonly onRollback?: (params: {
    taskFilePath: string;
    fromColumn: string;
    toColumn: string;
  }) => void;
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
  ProjectState.canAcceptDataCommand(deps.getState())
    ? Result.ok(undefined)
    : Result.err(ProjectError.invalidState());

/**
 * drop 直前の Board 状態を保持する VO。companion object に振る舞いを集約し、
 * 楽観 dispatch 列 / rollback dispatch 列 / partial-move 補正列の組み立ては
 * ここに閉じる。effect 側からは pure メソッドとして呼び出す。
 */
export type MoveSnapshot = {
  readonly originalTask: Task;
  readonly fromColumnOrderBefore: readonly string[];
  readonly toColumnOrderBefore: readonly string[];
};

/**
 * 指定カラムに属するタスクの filePath 列を抽出する pure helper。
 *
 * @param data 現在の ProjectData
 * @param columnName 抽出対象カラム名
 * @returns 該当カラムに属するタスクの filePath 配列（既存並び順を維持）
 */
const filePathsInColumn = (
  data: ProjectData,
  columnName: string,
): readonly string[] =>
  data.tasks.filter((t) => t.status === columnName).map((t) => t.filePath);

export const MoveSnapshot = {
  /**
   * ProjectData と target Task から snapshot を採取する（pure）。
   *
   * @param data drop 直前の ProjectData
   * @param originalTask 移動対象 task の immutable 参照
   * @param params 移動パラメータ
   * @returns 採取した MoveSnapshot
   */
  from: (
    data: ProjectData,
    originalTask: Task,
    params: MoveTaskParams,
  ): MoveSnapshot => ({
    originalTask,
    fromColumnOrderBefore: filePathsInColumn(data, params.fromColumn),
    toColumnOrderBefore: filePathsInColumn(data, params.toColumn),
  }),

  /**
   * snapshot.originalTask を楽観 status (toColumn) で書き換えた新 Task を返す（pure）。
   *
   * @param snapshot drop 直前 snapshot
   * @param toColumn 移動先カラム名（楽観反映する新 status）
   * @returns status を toColumn に差し替えた新 Task
   */
  toOptimisticTask: (snapshot: MoveSnapshot, toColumn: string): Task => ({
    ...snapshot.originalTask,
    status: toColumn,
  }),

  /**
   * 同一カラム並び替えで「変化なし」かを判定する（pure）。
   *
   * @param snapshot drop 直前 snapshot
   * @param filePaths 並び替え後の filePath 列（提案順）
   * @returns 提案順が toColumnOrderBefore と一致するなら true
   */
  isSameOrder: (
    snapshot: MoveSnapshot,
    filePaths: readonly string[],
  ): boolean =>
    filePaths.length === snapshot.toColumnOrderBefore.length &&
    filePaths.every((p, i) => p === snapshot.toColumnOrderBefore[i]),

  /**
   * カラム間 楽観 dispatch 列（pure）。
   * 順序: ① task-updated(楽観) → ② card-order-updated(楽観 toOrder)。
   *
   * @param snapshot drop 直前 snapshot
   * @param params 移動パラメータ
   * @param optimisticToOrder 楽観反映後の toColumn filePath 列
   * @returns dispatch 順に並んだ ProjectAction の配列
   */
  optimisticCrossDispatches: (
    snapshot: MoveSnapshot,
    params: MoveTaskParams,
    optimisticToOrder: readonly string[],
  ): readonly ProjectAction[] => [
    {
      type: "task-updated",
      originalFilePath: params.taskFilePath,
      task: MoveSnapshot.toOptimisticTask(snapshot, params.toColumn),
    },
    {
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths: [...optimisticToOrder],
    },
  ],

  /**
   * カラム間 updateTask 失敗時の rollback 段（逆順）（pure）。
   *
   * IPC 待機中に外部 listener（file watcher 由来の task-updated event 等）が
   * 同一 task を concurrent に更新している可能性があるため、`currentTask`
   * を見て分岐する:
   *
   * - `currentTask` が optimistic 状態（status === toColumn）に留まっている
   *   場合は、move 関連のフィールド（status）のみを fromColumn に戻し、
   *   その他のフィールド（title / body / labels / 等）は currentTask の値を
   *   そのまま採用する task-updated を発火する。これにより status は同じだが
   *   title 等が外部更新されたケースでも concurrent な更新を保護する。
   *   通常の 3 段（cardOrder(to 旧) → task(rollback) → cardOrder(from 旧)）。
   *   ②で task が fromColumn 末尾に補完される現象を③で打ち消す前提。
   * - `currentTask` が optimistic と乖離している（status が toColumn 以外 /
   *   task が消失した）場合は、外部 listener による status / 存在の concurrent
   *   更新が入ったとみなし、task-updated rollback を省略して cardOrder のみ
   *   復元する。snapshot で上書きしないことで外部更新を保護する。
   *
   * @param snapshot drop 直前 snapshot
   * @param params 移動パラメータ
   * @param currentTask rollback 直前の最新 state における target task
   * @returns 逆順 rollback 用 ProjectAction 配列（2〜3 段）
   */
  rollbackCrossDispatches: (
    snapshot: MoveSnapshot,
    params: MoveTaskParams,
    currentTask: Task | undefined,
  ): readonly ProjectAction[] => {
    const head: ProjectAction = {
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths: [...snapshot.toColumnOrderBefore],
    };
    const tail: ProjectAction = {
      type: "card-order-updated",
      columnName: params.fromColumn,
      filePaths: [...snapshot.fromColumnOrderBefore],
    };
    if (currentTask === undefined || currentTask.status !== params.toColumn) {
      return [head, tail];
    }
    const middle: ProjectAction = {
      type: "task-updated",
      originalFilePath: params.taskFilePath,
      task: { ...currentTask, status: params.fromColumn },
    };
    return [head, middle, tail];
  },

  /** partial-move（status 確定保持 / cardOrder のみ補正）の dispatch 列（pure）。 */
  partialRollbackDispatches: (
    snapshot: MoveSnapshot,
    params: MoveTaskParams,
  ): readonly ProjectAction[] => [
    {
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths: [...snapshot.toColumnOrderBefore],
    },
    {
      type: "card-order-updated",
      columnName: params.fromColumn,
      filePaths: [...snapshot.fromColumnOrderBefore],
    },
  ],

  /** 同一カラム rollback の dispatch（toColumnOrderBefore 1 段のみ）（pure）。 */
  rollbackSameDispatches: (
    snapshot: MoveSnapshot,
    params: MoveTaskParams,
  ): readonly ProjectAction[] => [
    {
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths: [...snapshot.toColumnOrderBefore],
    },
  ],
} as const;

/** version 一致確認の共通ガード。不一致なら Result.err(invalid-state) を返す。 */
const versionGuard = (
  deps: TaskActionDeps,
  version: number,
): ResultT<void, ProjectError> | null =>
  isProjectCurrent(deps.projectVersion, version)
    ? null
    : Result.err(ProjectError.invalidState("プロジェクトが切り替わりました"));

/** 単一引数を受け取り副作用のみ起こす callback の型エイリアス。 */
type SafeCallbackFn<T> = (arg: T) => void;

/**
 * callback 例外を握り潰す共通ヘルパ。queue 進行を絶対に止めない。
 *
 * @param fn 呼び出し対象の callback（undefined のとき no-op）
 * @param arg callback に渡す引数
 */
const safeCallback = <T>(fn: SafeCallbackFn<T> | undefined, arg: T): void => {
  try {
    fn?.(arg);
  } catch {
    // 通知失敗は無視する。
  }
};

type RevalidatedSnapshot = {
  readonly data: ProjectData;
  readonly target: Task;
};

/**
 * queue 開始時の再検証。session 状態 / project version / target task /
 * status / toColumn を pure に確認する。
 */
const revalidateInsideQueue = (
  deps: TaskActionDeps,
  params: MoveTaskParams,
  version: number,
): ResultT<RevalidatedSnapshot, ProjectError> => {
  if (
    !ProjectState.canAcceptDataCommand(deps.getState()) ||
    !isProjectCurrent(deps.projectVersion, version)
  ) {
    return Result.err(
      ProjectError.invalidState("プロジェクトが切り替わりました"),
    );
  }
  const data = ProjectState.visibleData(deps.getState());
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
      ProjectError.invalidState("タスクの状態が変わったためやり直してください"),
    );
  }
  if (!data.columns.some((c) => c.name === params.toColumn)) {
    return Result.err(
      ProjectError.invalidState("移動先カラムが見つかりません"),
    );
  }
  return Result.ok({ data, target });
};

/**
 * 副作用付きの実行ロジックを集約する companion object。
 * MoveSnapshot（pure）が組み立てた dispatch 列を流したり IPC を呼んだりするのがここ。
 */
const MoveExecution = {
  /** dispatch 列を順に流すヘルパ（順序保証）。 */
  dispatchAll: (
    deps: TaskActionDeps,
    actions: readonly ProjectAction[],
  ): void => {
    for (const action of actions) {
      deps.dispatch(action);
    }
  },

  /** カラム間移動 全体。orchestrator から呼ばれる単一 effect entry。 */
  crossColumn: async (
    deps: TaskActionDeps,
    params: MoveTaskParams,
    snapshot: MoveSnapshot,
    version: number,
    callbacks: MoveTaskCallbacks | undefined,
  ): Promise<ResultT<void, ProjectError>> => {
    const baseData = ProjectState.visibleData(deps.getState());
    const optimisticToOrder = buildMovedFilePaths(
      baseData?.tasks ?? [],
      params.taskFilePath,
      params.fromColumn,
      params.toColumn,
      params.toIndex,
    );
    MoveExecution.dispatchAll(
      deps,
      MoveSnapshot.optimisticCrossDispatches(
        snapshot,
        params,
        optimisticToOrder,
      ),
    );
    safeCallback(callbacks?.onOptimisticApplied, {
      taskFilePath: params.taskFilePath,
      fromColumn: params.fromColumn,
      toColumn: params.toColumn,
    });

    const updateResult = await updateTask({
      filePath: params.taskFilePath,
      status: params.toColumn,
    });
    const guardAfterUpdate = versionGuard(deps, version);
    if (guardAfterUpdate) {
      return guardAfterUpdate;
    }
    if (!updateResult.ok) {
      const beforeRollback = ProjectState.visibleData(deps.getState());
      const currentTask = beforeRollback?.tasks.find(
        (t) => t.filePath === params.taskFilePath,
      );
      MoveExecution.dispatchAll(
        deps,
        MoveSnapshot.rollbackCrossDispatches(snapshot, params, currentTask),
      );
      safeCallback(callbacks?.onRollback, {
        taskFilePath: params.taskFilePath,
        fromColumn: params.fromColumn,
        toColumn: params.toColumn,
      });
      return Result.err(ProjectError.tauri(updateResult.error));
    }

    deps.dispatch({
      type: "task-updated",
      originalFilePath: params.taskFilePath,
      task: updateResult.value,
    });
    const latest = ProjectState.visibleData(deps.getState());
    const filePaths = buildMovedFilePaths(
      latest?.tasks ?? [],
      params.taskFilePath,
      params.fromColumn,
      params.toColumn,
      params.toIndex,
    );
    const orderResult = await updateCardOrder({
      columnName: params.toColumn,
      filePaths,
    });
    const guardAfterOrder = versionGuard(deps, version);
    if (guardAfterOrder) {
      return guardAfterOrder;
    }
    if (!orderResult.ok) {
      MoveExecution.dispatchAll(
        deps,
        MoveSnapshot.partialRollbackDispatches(snapshot, params),
      );
      return Result.err(ProjectError.partialMove(orderResult.error));
    }
    deps.dispatch({
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths,
    });
    return Result.ok(undefined);
  },

  /** 同一カラム並び替え 全体。orchestrator から呼ばれる単一 effect entry。 */
  sameColumn: async (
    deps: TaskActionDeps,
    params: MoveTaskParams,
    snapshot: MoveSnapshot,
    version: number,
    data: ProjectData,
  ): Promise<ResultT<void, ProjectError>> => {
    const filePaths = buildMovedFilePaths(
      data.tasks,
      params.taskFilePath,
      params.fromColumn,
      params.toColumn,
      params.toIndex,
    );
    if (MoveSnapshot.isSameOrder(snapshot, filePaths)) {
      return Result.ok(undefined);
    }
    deps.dispatch({
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths,
    });
    const orderResult = await updateCardOrder({
      columnName: params.toColumn,
      filePaths,
    });
    const guard = versionGuard(deps, version);
    if (guard) {
      return guard;
    }
    if (!orderResult.ok) {
      MoveExecution.dispatchAll(
        deps,
        MoveSnapshot.rollbackSameDispatches(snapshot, params),
      );
      return Result.err(ProjectError.tauri(orderResult.error));
    }
    deps.dispatch({
      type: "card-order-updated",
      columnName: params.toColumn,
      filePaths,
    });
    return Result.ok(undefined);
  },
} as const;

/**
 * Drop 確定時に Board から呼ばれる単一 entry point。
 * preflight + queue + 分岐のみの薄い orchestrator。
 *
 * - fromColumn !== toColumn: 楽観 dispatch（task-updated + card-order-updated）→
 *   updateTask IPC → 成功なら確定 dispatch + updateCardOrder、失敗なら 3 段 rollback
 * - fromColumn === toColumn: 楽観 dispatch（card-order-updated）→ updateCardOrder IPC →
 *   成功なら確定 dispatch、失敗なら 1 段 rollback
 *
 * @param deps queue / version / state / dispatch 依存
 * @param params 移動パラメータ
 * @param callbacks 楽観 / rollback の通知 callback（省略可）
 * @returns 成功時 Result.ok(undefined) / 失敗時 Result.err(ProjectError)
 */
export const moveTaskAction = (
  deps: TaskActionDeps,
  params: MoveTaskParams,
  callbacks?: MoveTaskCallbacks,
): Promise<ResultT<void, ProjectError>> => {
  const preflight = ensureLoaded(deps);
  if (!preflight.ok) {
    return Promise.resolve(preflight);
  }
  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    const checked = revalidateInsideQueue(deps, params, version);
    if (!checked.ok) {
      return checked;
    }
    const { data, target } = checked.value;
    const snapshot = MoveSnapshot.from(data, target, params);
    return params.fromColumn !== params.toColumn
      ? MoveExecution.crossColumn(deps, params, snapshot, version, callbacks)
      : MoveExecution.sameColumn(deps, params, snapshot, version, data);
  });
};
