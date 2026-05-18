import type { ProjectData } from "@/domains/project-data";
import type { Column } from "@/types/column";
import { Result, type Result as ResultT } from "@/utils/result";
import { enqueueProjectCommand, isProjectCurrent } from "../concurrency";
import { ProjectError } from "../errors";
import type { ProjectAction } from "../reducer";
import { ProjectSessionState } from "../state/projectSessionState";
import type { ColumnsCommandBuilder } from "./columnsCommand";
import { reorderColumnsByIndex } from "./reorderColumnsByIndex";
import type { TaskActionDeps } from "./tasks";
import {
  PROJECT_SWITCHED_MESSAGE,
  runUpdateColumnsInsideQueue,
} from "./updateColumns";

/** `useProject.reorderColumns` が受け取るパラメータ。 */
export type ReorderColumnsParams = {
  readonly fromColumnName: string;
  readonly toColumnName: string;
};

/**
 * 楽観 dispatch / rollback 直後に呼び出し側へ通知する callback の引数。
 * fromIndex / toIndex は `ReorderSnapshot.from` が表示順上で再解決した派生値。
 */
export type ReorderColumnsEvent = {
  readonly fromColumnName: string;
  readonly toColumnName: string;
  readonly columnName: string;
  readonly fromIndex: number;
  readonly toIndex: number;
};

/**
 * `reorderColumns` の楽観 / rollback 通知。callback 例外は内部で握り潰し
 * queue 進行に影響させない。preflight 失敗 / no-op では呼ばれない。
 */
export type ReorderColumnsCallbacks = {
  readonly onOptimisticApplied?: (event: ReorderColumnsEvent) => void;
  readonly onRollback?: (event: ReorderColumnsEvent) => void;
};

/** `reorderColumns` の戻り値: 実際に invoke / dispatch まで進んだかどうか。 */
export type ReorderColumnsResult = { readonly applied: boolean };

/**
 * 並び替え前後の columns / 移動カラム名 / 表示順上で解決された index /
 * no-op 判定を保持する pure VO。
 *
 * 表示順 (order 昇順) に並べた columns 上で fromColumnName / toColumnName を
 * index に解決する。`data.columns` の配列順は信用しない。
 */
export type ReorderSnapshot = {
  readonly beforeColumns: readonly Column[];
  readonly afterColumns: readonly Column[];
  readonly columnName: string;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly isNoop: boolean;
};

/**
 * columns を order 昇順の表示順に並べた新配列を返す（pure）。
 *
 * @param columns 任意の順序の columns
 * @returns order 昇順で並んだ新配列
 */
const sortByOrder = (columns: readonly Column[]): readonly Column[] =>
  [...columns].sort((a, b) => a.order - b.order);

const NOOP_INDEX = -1;

/**
 * isNoop=true の snapshot を生成する（pure）。afterColumns は beforeColumns と参照同一。
 *
 * @param beforeColumns 並び替え前 columns（表示順）
 * @returns isNoop=true の ReorderSnapshot
 */
const makeNoop = (beforeColumns: readonly Column[]): ReorderSnapshot => ({
  beforeColumns,
  afterColumns: beforeColumns,
  columnName: "",
  fromIndex: NOOP_INDEX,
  toIndex: NOOP_INDEX,
  isNoop: true,
});

export const ReorderSnapshot = {
  /**
   * 表示順に並べた columns 上で fromColumnName / toColumnName を index に解決し、
   * `reorderColumnsByIndex` で並び替えた snapshot を返す。
   *
   * isNoop=true となる条件:
   *   - columns.length < 2
   *   - fromColumnName が表示順上に存在しない
   *   - toColumnName が表示順上に存在しない
   *   - 解決した fromIndex === toIndex
   *
   * isNoop=true のとき afterColumns は beforeColumns と参照同一。
   *
   * @param data 採取時点の ProjectData
   * @param fromColumnName 移動元カラム名
   * @param toColumnName 移動先カラム名
   * @returns 採取した ReorderSnapshot
   */
  from(
    data: ProjectData,
    fromColumnName: string,
    toColumnName: string,
  ): ReorderSnapshot {
    const beforeColumns = sortByOrder(data.columns);
    if (beforeColumns.length < 2) {
      return makeNoop(beforeColumns);
    }
    const fromIndex = beforeColumns.findIndex((c) => c.name === fromColumnName);
    const toIndex = beforeColumns.findIndex((c) => c.name === toColumnName);
    if (fromIndex === NOOP_INDEX || toIndex === NOOP_INDEX) {
      return makeNoop(beforeColumns);
    }
    const reordered = reorderColumnsByIndex(beforeColumns, fromIndex, toIndex);
    if (reordered === null) {
      return makeNoop(beforeColumns);
    }
    return {
      beforeColumns,
      afterColumns: reordered,
      columnName: fromColumnName,
      fromIndex,
      toIndex,
      isNoop: false,
    };
  },

  /**
   * 楽観 dispatch（columns-replaced）を組み立てる。
   *
   * @param snapshot 採取済み snapshot
   * @returns afterColumns を反映する columns-replaced action
   */
  optimisticDispatch(snapshot: ReorderSnapshot): ProjectAction {
    return {
      type: "columns-replaced",
      columns: [...snapshot.afterColumns],
      renames: [],
      doneColumn: undefined,
    };
  },

  /**
   * rollback dispatch（columns-replaced）を組み立てる。
   *
   * @param snapshot 採取済み snapshot
   * @returns beforeColumns へ戻す columns-replaced action
   */
  rollbackDispatch(snapshot: ReorderSnapshot): ProjectAction {
    return {
      type: "columns-replaced",
      columns: [...snapshot.beforeColumns],
      renames: [],
      doneColumn: undefined,
    };
  },

  /**
   * `runUpdateColumnsInsideQueue` に渡す `ColumnsCommandBuilder` を返す。
   * builder は current を見ず snapshot.afterColumns をそのまま返すため、
   * 楽観適用済みの state からの二重並び替えは起きない。
   *
   * @param snapshot 採取済み snapshot
   * @returns 採取時点で確定した afterColumns を返す builder
   */
  toCommandBuilder(snapshot: ReorderSnapshot): ColumnsCommandBuilder {
    return () => ({
      columns: [...snapshot.afterColumns],
      renames: [],
      doneColumn: undefined,
    });
  },
} as const;

/** snapshot から callback event を組み立てる pure helper。 */
const eventFor = (
  snapshot: ReorderSnapshot,
  params: ReorderColumnsParams,
): ReorderColumnsEvent => ({
  fromColumnName: params.fromColumnName,
  toColumnName: params.toColumnName,
  columnName: snapshot.columnName,
  fromIndex: snapshot.fromIndex,
  toIndex: snapshot.toIndex,
});

/** ReorderColumnsEvent を受け取る single-arg callback の型エイリアス。 */
type ReorderEventCallback = (event: ReorderColumnsEvent) => void;

/**
 * callback 例外を握り潰し queue 進行を止めない共通ヘルパ。
 *
 * @param fn 呼び出し対象（undefined のとき no-op）
 * @param event callback に渡す event
 */
const safeCallback = (
  fn: ReorderEventCallback | undefined,
  event: ReorderColumnsEvent,
): void => {
  try {
    fn?.(event);
  } catch {
    // 通知失敗は無視する。
  }
};

/**
 * effect 段: queue 内で楽観 dispatch → `runUpdateColumnsInsideQueue` →
 * 失敗時 rollback dispatch / callback を実行する。
 *
 * 前提（caller 責務）:
 *   - 呼び出し側が `snapshot.isNoop === false` を保証してから呼ぶこと。
 *     no-op の早期 return は `reorderColumnsAction` の preflight 側で扱う。
 *   - `runUpdateColumnsInsideQueue` が `invalid-state` を返した場合は、
 *     reducer が既に新 project の state に切り替わっている前提で rollback
 *     dispatch / callback を行わずそのまま err を返す。
 */
export const ReorderExecution = {
  /**
   * 楽観 dispatch → invoke → 確定 or rollback の effect を実行する。
   *
   * @param deps queue / version / state / dispatch 依存
   * @param params 並び替えパラメータ
   * @param snapshot pure 段で組み立てた snapshot（isNoop=false 前提）
   * @param version queue 取得時点の project version
   * @param callbacks 楽観 / rollback の通知 callback（省略可）
   * @returns invoke 成否を含む Result
   */
  async run(
    deps: TaskActionDeps,
    params: ReorderColumnsParams,
    snapshot: ReorderSnapshot,
    version: number,
    callbacks: ReorderColumnsCallbacks | undefined,
  ): Promise<ResultT<ReorderColumnsResult, ProjectError>> {
    deps.dispatchSync(ReorderSnapshot.optimisticDispatch(snapshot));
    const event = eventFor(snapshot, params);
    safeCallback(callbacks?.onOptimisticApplied, event);

    const result = await runUpdateColumnsInsideQueue(
      deps,
      ReorderSnapshot.toCommandBuilder(snapshot),
      version,
    );
    if (result.ok) {
      return Result.ok({ applied: true });
    }
    // invalid-state でも project switch（reducer が新 project に切替済み）以外は
    // rollback すべき。doneColumn validation 失敗や visibleData == null のケースでは
    // reducer は loaded のままなので楽観 dispatch を before 列に戻す必要がある。
    const isStaleProject =
      result.error.kind === "invalid-state" &&
      result.error.message === PROJECT_SWITCHED_MESSAGE;
    if (isStaleProject) {
      return Result.err(result.error);
    }
    deps.dispatchSync(ReorderSnapshot.rollbackDispatch(snapshot));
    safeCallback(callbacks?.onRollback, event);
    return Result.err(result.error);
  },
} as const;

/**
 * Drop 確定時に Board から呼ばれる単一 entry point。
 * preflight + queue + name→index 再解決 + 楽観/invoke/rollback の薄い orchestrator。
 *
 * @param deps queue / version / state / dispatch 依存
 * @param params 並び替えパラメータ（fromColumnName / toColumnName）
 * @param callbacks 楽観 / rollback の通知 callback（省略可）
 * @returns invoke 成否を含む Result（no-op は applied=false）
 */
export const reorderColumnsAction = (
  deps: TaskActionDeps,
  params: ReorderColumnsParams,
  callbacks?: ReorderColumnsCallbacks,
): Promise<ResultT<ReorderColumnsResult, ProjectError>> => {
  if (!ProjectSessionState.canAcceptDataCommand(deps.getState())) {
    return Promise.resolve(Result.err(ProjectError.invalidState()));
  }
  const version = deps.projectVersion.current;
  return enqueueProjectCommand(deps.projectCommandQueue, async () => {
    if (!isProjectCurrent(deps.projectVersion, version)) {
      return Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE));
    }
    const data = ProjectSessionState.visibleData(deps.getState());
    if (data === null) {
      return Result.err(ProjectError.invalidState());
    }
    const snapshot = ReorderSnapshot.from(
      data,
      params.fromColumnName,
      params.toColumnName,
    );
    if (snapshot.isNoop) {
      return Result.ok<ReorderColumnsResult>({ applied: false });
    }
    return ReorderExecution.run(deps, params, snapshot, version, callbacks);
  });
};
