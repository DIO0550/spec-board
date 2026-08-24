import { moveTask, type TauriError } from "@/lib/tauri";
import type { Task, TaskFilePath } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import type { ProjectAction, ProjectData } from "../reducer";
import { ProjectState } from "../state/projectState";
import { buildMovedFilePaths } from "./buildMovedFilePaths";
import type { TaskActionDeps } from "./deps";

/** moveTask が受け取るパラメータ。 */
export type MoveTaskParams = {
  readonly taskFilePath: TaskFilePath;
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
    taskFilePath: TaskFilePath;
    fromColumn: string;
    toColumn: string;
  }) => void;
  /**
   * カラム間 status 変更の move_task 失敗による rollback が完了した直後に
   * 1 度だけ呼ばれる。同一カラム rollback / projectVersion 不一致による
   * invalid-state では呼ばれない。
   */
  readonly onRollback?: (params: {
    taskFilePath: TaskFilePath;
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
 * 楽観 dispatch 列 / rollback dispatch 列の組み立てはここに閉じる。
 * effect 側からは pure メソッドとして呼び出す。
 */
export type MoveSnapshot = {
  readonly originalTask: Task;
  readonly fromColumnOrderBefore: readonly TaskFilePath[];
  readonly toColumnOrderBefore: readonly TaskFilePath[];
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
): readonly TaskFilePath[] =>
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
    filePaths: readonly TaskFilePath[],
  ): boolean =>
    filePaths.length === snapshot.toColumnOrderBefore.length &&
    filePaths.every((p, i) => p === snapshot.toColumnOrderBefore[i]),

  /**
   * カラム間 楽観 dispatch 列（pure）。
   * 順序: ① task-updated(楽観) → ② card-order-updated(楽観 toOrder)。
   *
   * @param params 移動パラメータ
   * @param optimisticTask 楽観反映する Task（確定段の同一性判定に同じ参照を使う）
   * @param optimisticToOrder 楽観反映後の toColumn filePath 列
   * @returns dispatch 順に並んだ ProjectAction の配列
   */
  optimisticCrossDispatches: (
    params: MoveTaskParams,
    optimisticTask: Task,
    optimisticToOrder: readonly TaskFilePath[],
  ): readonly ProjectAction[] => [
    {
      type: "task-updated",
      originalFilePath: params.taskFilePath,
      task: optimisticTask,
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

  /**
   * カラム間 move_task 成功時の確定 dispatch 列（pure）。
   *
   * IPC 待機中に外部 listener（file watcher 由来の task-updated event 等）が同一 task を
   * 更新している可能性があるため、`currentTask` を見て分岐する:
   *
   * - `currentTask` が**楽観 dispatch した Task そのもの**（参照が同一）なら、待機中に
   *   誰も触っていないので BE 応答の Task をそのまま確定値として採用する。BE 応答には
   *   書き込み後の md を再解析した結果（warning の解消など）が載っており、成功時は
   *   自前書き込み由来の watcher イベントが抑止されるため、これが唯一の反映経路になる。
   * - 参照が変わっている（外部更新が入った）場合は、move が所有する status のみを
   *   toColumn に載せ替え、title / body / labels 等は currentTask の値を残す。BE 応答で
   *   丸ごと上書きすると、待機中に入った外部更新を巻き戻してしまう。status だけの比較で
   *   判定すると「status は移動先のまま title だけ外部更新された」ケースを取りこぼす。
   * - `currentTask` が消えている（外部削除など）場合は dispatch しない。既に state から
   *   消えた task を確定 dispatch で復活させない（rollback 側と同じ判断）。
   *
   * 参照同一性で判定できるのは、reducer が `task-updated` の Task を複製せずそのまま
   * 保持する契約だから（`ProjectData.applyTaskUpdated`）。仮にこの契約が変わっても
   * 「常に status のみマージ」へ倒れるだけで、外部更新を失う方向には壊れない。
   *
   * @param params 移動パラメータ
   * @param serverTask move_task IPC が返した確定 Task
   * @param optimisticTask 楽観 dispatch で流した Task（参照比較の基準）
   * @param currentTask 確定 dispatch 直前の最新 state における target task
   * @returns 確定用 ProjectAction 配列（0〜1 段）
   */
  confirmedCrossDispatches: (
    params: MoveTaskParams,
    serverTask: Task,
    optimisticTask: Task,
    currentTask: Task | undefined,
  ): readonly ProjectAction[] => {
    if (currentTask === undefined) {
      return [];
    }
    const task =
      currentTask === optimisticTask
        ? serverTask
        : { ...currentTask, status: params.toColumn };
    return [
      {
        type: "task-updated",
        originalFilePath: params.taskFilePath,
        task,
      },
    ];
  },

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
    : Result.err(ProjectError.projectSwitched());

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

/**
 * 拒否理由が「他の変更が先に入っていた」ものであれば、最新状態の取り直しを要求する。
 *
 * rollback だけで終えると、拒否の原因になった変更が watcher で届いていない場合に
 * 古い画面のまま再試行して再び失敗する。取り直しは既存の resync 経路に委ねる
 * （read barrier / single-in-flight / gate の watermark 更新を持っているのはそちら）。
 *
 * この関数は queue の中から呼ばれるが、resync は queue を占有せず read barrier で
 * tail の安定を待つため、呼び出し元の action が return するまで実際の取得は始まらない。
 *
 * @param deps task action の共通 deps
 * @param error IPC が返した TauriError
 */
const requestResyncOnConflict = (
  deps: TaskActionDeps,
  error: TauriError,
): void => {
  if (error.code !== "CONFLICT") {
    return;
  }
  deps.requestResync("move-conflict");
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
    return Result.err(ProjectError.projectSwitched());
  }
  const data = ProjectState.visibleData(deps.getState());
  if (data === null) {
    return Result.err(ProjectError.invalidState());
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
    // 確定段で「待機中に外部更新が入ったか」を参照比較で見分けるため、楽観 dispatch した
    // Task の参照をここで保持しておく。
    const optimisticTask = MoveSnapshot.toOptimisticTask(
      snapshot,
      params.toColumn,
    );
    MoveExecution.dispatchAll(
      deps,
      MoveSnapshot.optimisticCrossDispatches(
        params,
        optimisticTask,
        optimisticToOrder,
      ),
    );
    safeCallback(callbacks?.onOptimisticApplied, {
      taskFilePath: params.taskFilePath,
      fromColumn: params.fromColumn,
      toColumn: params.toColumn,
    });

    const moveResult = await moveTask({
      filePath: params.taskFilePath,
      fromColumn: params.fromColumn,
      toColumn: params.toColumn,
      toColumnFilePaths: optimisticToOrder,
      expectedToColumnOrder: snapshot.toColumnOrderBefore,
    });
    const guard = versionGuard(deps, version);
    if (guard) {
      return guard;
    }
    if (!moveResult.ok) {
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
      requestResyncOnConflict(deps, moveResult.error);
      return Result.err(ProjectError.tauri(moveResult.error));
    }

    // cardOrder は BE が楽観 dispatch と同じ並びを永続化済みのため、確定 dispatch は
    // task-updated だけでよい（再計算した card-order-updated を流すと、IPC 待機中に
    // 入った外部更新を巻き戻してしまう）。
    const beforeConfirm = ProjectState.visibleData(deps.getState());
    const currentTask = beforeConfirm?.tasks.find(
      (t) => t.filePath === params.taskFilePath,
    );
    MoveExecution.dispatchAll(
      deps,
      MoveSnapshot.confirmedCrossDispatches(
        params,
        moveResult.value,
        optimisticTask,
        currentTask,
      ),
    );
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
    const moveResult = await moveTask({
      filePath: params.taskFilePath,
      fromColumn: params.fromColumn,
      toColumn: params.toColumn,
      toColumnFilePaths: filePaths,
      // 宛先＝移動元なので、toColumnOrderBefore が移動前の並びを表す。
      expectedToColumnOrder: snapshot.toColumnOrderBefore,
    });
    const guard = versionGuard(deps, version);
    if (guard) {
      return guard;
    }
    if (!moveResult.ok) {
      MoveExecution.dispatchAll(
        deps,
        MoveSnapshot.rollbackSameDispatches(snapshot, params),
      );
      requestResyncOnConflict(deps, moveResult.error);
      return Result.err(ProjectError.tauri(moveResult.error));
    }
    // 楽観 dispatch と同じ並びが永続化されたため、確定 dispatch は不要。
    return Result.ok(undefined);
  },
} as const;

/**
 * Drop 確定時に Board から呼ばれる単一 entry point。
 * preflight + queue + 分岐のみの薄い orchestrator。
 *
 * status 変更と cardOrder 更新は BE 側で 1 つの command にまとまっているため、
 * IPC は経路を問わず 1 回だけで、結果は確定か rollback の 2 分岐に収束する。
 *
 * - fromColumn !== toColumn: 楽観 dispatch（task-updated + card-order-updated）→
 *   move_task IPC → 成功なら task-updated で確定、失敗なら 3 段 rollback
 * - fromColumn === toColumn: 楽観 dispatch（card-order-updated）→ move_task IPC →
 *   成功なら追加 dispatch なし、失敗なら 1 段 rollback
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
