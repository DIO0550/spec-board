import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  type ColumnRename,
  type CreateTaskParams,
  createTask as createTaskInvoke,
  type DeleteTaskParams,
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  type UpdateTaskParams,
  updateColumns as updateColumnsInvoke,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import { Result, type Result as ResultT } from "@/utils/result";
import type { ProjectError } from "./errors";
import {
  initialState,
  type ProjectData,
  type ProjectState,
  reducer,
} from "./reducer";

export type { ProjectError } from "./errors";
export type { ProjectData, ProjectState } from "./reducer";

/**
 * invalid-state の Result.err を即座に作成するヘルパ。
 *
 * @param message 任意のメッセージ（デフォルト: "プロジェクトが開かれていません"）
 * @returns kind=invalid-state を持つ Result.err
 */
const invalidStateErr = <T>(
  message = "プロジェクトが開かれていません",
): ResultT<T, ProjectError> => Result.err({ kind: "invalid-state", message });

/** updateColumns に渡す静的入力（既に最新 state から計算済みの場合）。 */
export type UpdateColumnsParams = {
  columns: Column[];
  renames?: ColumnRename[];
  doneColumn?: string;
};

/**
 * updateColumns の updater 関数形式。
 * queue 実行時の最新 ProjectData から次状態を計算する。
 * `null` を返した場合は invoke を行わずに success（state 不変）として終了する。
 */
export type UpdateColumnsUpdater = (
  current: ProjectData,
) => UpdateColumnsParams | null;

/** updateColumns に渡せる入力（静的 / 動的）。 */
export type UpdateColumnsInput = UpdateColumnsParams | UpdateColumnsUpdater;

/** useProject hook のオプション引数。 */
export type UseProjectOptions = {
  /**
   * openProject 系の失敗時にのみ呼ばれる通知コールバック。
   * - dialog plugin 例外
   * - openProject invoke 失敗 (error 遷移時 / previousLoaded への restore 時 双方で発火)
   * - dialog cancel / 後勝ち破棄 / unmount 時には呼ばれない
   * - CRUD method 失敗は戻り値 Result.err で受け取る（onError では発火しない）
   */
  onError?: (error: ProjectError) => void;
};

/** useProject hook の戻り値。 */
export type UseProjectResult = {
  /** 現在の state */
  state: ProjectState;
  /** OS dialog → invoke → state 反映を一気通貫で行う */
  openProject: () => Promise<void>;
  /** タスク作成。loaded 以外なら invalid-state を返す */
  createTask: (
    params: CreateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  /** タスク更新。loaded 以外なら invalid-state を返す */
  updateTask: (
    params: UpdateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  /** タスク削除。loaded 以外なら invalid-state を返す */
  deleteTask: (
    params: DeleteTaskParams,
  ) => Promise<ResultT<void, ProjectError>>;
  /**
   * カラム更新（追加・リネーム・削除）。loaded 以外なら invalid-state を返す。
   * 内部 queue で直列化される。updater 関数を渡すと queue 実行時の最新 state から再計算される。
   * `applied: false` は updater が `null` を返したり re-validation で skip された場合（invoke 未実行）。
   */
  updateColumns: (
    input: UpdateColumnsInput,
  ) => Promise<ResultT<{ applied: boolean }, ProjectError>>;
  /** 任意状態から idle に戻す */
  reset: () => void;
};

/**
 * input が updater 関数か判定する型ガード。
 *
 * @param input 静的 params または updater 関数
 * @returns true なら updater
 */
const isUpdater = (input: UpdateColumnsInput): input is UpdateColumnsUpdater =>
  typeof input === "function";

/**
 * CRUD method を受け付けられる state か判定する。
 * - loaded: そのまま受け付け
 * - loading + previousLoaded: Board が継続表示されているため CRUD UI も
 *   操作可能になっている。chain + generation guard で安全性が確保されるため
 *   受け付ける (loading 完了後に generation mismatch で abort される)
 *
 * @param state 現在の state
 * @returns true なら CRUD を queue に enqueue 可能
 */
const acceptsCrud = (state: ProjectState): boolean =>
  state.kind === "loaded" ||
  (state.kind === "loading" && state.previousLoaded !== undefined);

/**
 * 表示中の ProjectData を返す。loading + previousLoaded のときは
 * previousLoaded.data を返す (Board がそれで表示されているため)。
 *
 * @param state 現在の state
 * @returns ProjectData または null
 */
const visibleProjectData = (state: ProjectState): ProjectData | null => {
  if (state.kind === "loaded") {
    return state.data;
  }
  if (state.kind === "loading" && state.previousLoaded) {
    return state.previousLoaded.data;
  }
  return null;
};

/**
 * column 名が `params.columns` に含まれていない場合 true (= 削除されたカラム)。
 *
 * @param column 旧 column
 * @param params 新 columns を含む UpdateColumnsParams
 * @returns 削除なら true
 */
const isColumnRemoved = (
  column: Column,
  params: UpdateColumnsParams,
): boolean => !params.columns.some((nc) => nc.name === column.name);

/**
 * 操作が doneColumn に影響を与え得るか判定する。
 * - rename を伴う場合 (renames が空でない)
 * - 既存 column が新 columns に含まれない (削除された) 場合
 * これら以外の操作 (純粋な column 追加 / 並び替え) では BE が doneColumn を preserve
 * するため refetch 不要。
 *
 * @param currentColumns 現在の columns
 * @param params 適用する UpdateColumnsParams
 * @returns sensitive なら true
 */
const isDoneColumnSensitive = (
  currentColumns: Column[],
  params: UpdateColumnsParams,
): boolean => {
  if ((params.renames ?? []).length > 0) {
    return true;
  }
  return currentColumns.some((c) => isColumnRemoved(c, params));
};

/**
 * useProject — プロジェクトを開く + プロジェクト state の所有 + 全 CRUD を一手に担う hook。
 *
 * dialog 連打ガード (`isDialogOpeningRef`)、invoke 後勝ち (`requestIdRef`)、
 * unmount safeguard (`isMountedRef`) を内部で持つ。CRUD 系も「invoke 開始時のプロジェクト
 * path」と「resolve 時のプロジェクト path」が一致しない場合は state を更新せず stale-result として捨てる。
 *
 * @param options optional な onError ハンドラ
 * @returns state / openProject / 全 CRUD method / reset
 */
export const useProject = (
  options: UseProjectOptions = {},
): UseProjectResult => {
  const { onError } = options;
  const [state, dispatch] = useReducer(reducer, initialState);

  const isDialogOpeningRef = useRef<boolean>(false);
  const requestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const stateRef = useRef<ProjectState>(state);
  const columnsQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // open_project + get_columns を BE レベルで直列化するキュー。
  // overlap を許すと BE current project が intermediate switch して、ある呼び出しの
  // tasks と別呼び出しの columns/doneColumn が混ざる問題を防ぐ。
  // queue 内では requestId mismatch なら invoke 自体を skip し「後勝ち」を維持する。
  const openQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // open-succeed / reset / open-fail 復元の度に増加する世代カウンタ。
  // path 一致だけでは「同じ path を開き直し」のケースで pending CRUD が
  // 新世代に誤適用される。CRUD は開始時にこの値を snapshot し、resolve 時に再照合する。
  const generationRef = useRef<number>(0);

  // dispatch と stateRef を同期更新するヘルパ。
  // useEffect 経由の sync は次の render flush 後にしか走らないため、
  // queue 内で連続して updateColumns を呼ぶと古い state を読む問題を回避する。
  const dispatchSync = useCallback((action: Parameters<typeof dispatch>[0]) => {
    stateRef.current = reducer(stateRef.current, action);
    dispatch(action);
  }, []);

  // 世代を bump し、関連 queue / ref も同時に reset するヘルパ。
  // 旧プロジェクトの updateColumns invoke が pending のまま新プロジェクトに
  // 切り替わったとき、新プロジェクトの column 操作が古い promise の後ろに
  // 詰まる問題を回避する (queue を破棄してフレッシュにする)。
  const bumpGeneration = useCallback(() => {
    generationRef.current += 1;
    columnsQueueRef.current = Promise.resolve();
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const openProject = useCallback(async (): Promise<void> => {
    if (isDialogOpeningRef.current) {
      return;
    }
    isDialogOpeningRef.current = true;

    const dialogResult = await openDirectoryDialog();
    isDialogOpeningRef.current = false;

    if (!isMountedRef.current) {
      return;
    }

    if (!dialogResult.ok) {
      onError?.({ kind: "tauri", error: dialogResult.error });
      return;
    }

    const path = dialogResult.value;
    if (path === null) {
      // キャンセル: state 不変
      return;
    }

    requestIdRef.current += 1;
    const myId = requestIdRef.current;
    dispatchSync({ type: "open-start", path });

    // open_project + get_columns を BE レベルで直列化する。overlap を許すと
    // BE current project が intermediate switch して、tasks と columns/doneColumn が
    // 別々の project から混入する問題が発生する (Copilot 指摘)。
    // queue 内で requestId mismatch なら invoke 自体を skip し「後勝ち」を維持する。
    const queued = openQueueRef.current.then(async () => {
      // queue 開始時の早期スキップ: 既により新しい open がリクエストされていれば
      // BE invoke 自体を発行しない (BE への意味のない open + 即座の re-open を回避)
      if (!isMountedRef.current || myId !== requestIdRef.current) {
        return;
      }

      const invokeResult = await openProjectInvoke({ path });

      if (!isMountedRef.current) {
        return;
      }
      if (myId !== requestIdRef.current) {
        // 後勝ち破棄: 後続の open_project が走るため、こちらの結果は捨てる
        return;
      }

      if (!invokeResult.ok) {
        // 世代を bump するのは error 状態に遷移する場合のみ。
        // previousLoaded に復元される場合はユーザは「同じ project に戻る」だけなので、
        // 元プロジェクト上で in-flight だった CRUD は valid なまま反映する必要がある。
        const willRestore =
          stateRef.current.kind === "loading" &&
          stateRef.current.previousLoaded !== undefined;
        if (!willRestore) {
          bumpGeneration();
        }
        dispatchSync({ type: "open-fail", path, error: invokeResult.error });
        onError?.({ kind: "tauri", error: invokeResult.error });
        return;
      }

      // doneColumn を取得するため get_columns も呼ぶ。BE 側の open_project は
      // doneColumn を返さないが、config-spec 上 get_columns で取得できる。
      // get_columns 失敗時は openProject 全体を失敗として扱う:
      // - doneColumn 未取得のまま loaded に進むと、Board / SubIssueProgress が
      //   undefined を「Done」リテラル扱いするため、custom done column の
      //   project で sub-issue progress が誤判定される
      // - 失敗を userに通知して retry を促す方が安全
      const columnsResult = await getColumnsInvoke();
      if (!isMountedRef.current) {
        return;
      }
      if (myId !== requestIdRef.current) {
        return;
      }

      if (!columnsResult.ok) {
        const willRestore =
          stateRef.current.kind === "loading" &&
          stateRef.current.previousLoaded !== undefined;
        if (!willRestore) {
          bumpGeneration();
        }
        dispatchSync({
          type: "open-fail",
          path,
          error: columnsResult.error,
        });
        onError?.({ kind: "tauri", error: columnsResult.error });
        return;
      }

      const data: ProjectData = {
        tasks: invokeResult.value.tasks,
        columns: columnsResult.value.columns,
        doneColumn: columnsResult.value.doneColumn,
      };
      bumpGeneration();
      dispatchSync({ type: "open-succeed", path, data });
    });
    openQueueRef.current = queued.catch(() => undefined);
    await queued;
  }, [onError, dispatchSync, bumpGeneration]);

  const createTask = useCallback(
    (params: CreateTaskParams): Promise<ResultT<Task, ProjectError>> => {
      const snapshot = stateRef.current;
      if (!acceptsCrud(snapshot)) {
        return Promise.resolve(invalidStateErr<Task>());
      }
      const startGen = generationRef.current;
      // openQueueRef にチェーン (BE level で open / CRUD を完全直列化)。
      // 単に await openQueueRef.current だと「await 後 / invoke 前」に新しい open が
      // enqueue される race が残るため、CRUD 自体を queue tail に積む。
      // 以後の openProject はこの CRUD の完了を待つ → BE current project が
      // CRUD invoke 中に switch されない保証になる。
      const queued = openQueueRef.current.then(
        async (): Promise<ResultT<Task, ProjectError>> => {
          if (!isMountedRef.current || generationRef.current !== startGen) {
            return invalidStateErr<Task>("プロジェクトが切り替わりました");
          }
          const result = await createTaskInvoke(params);
          if (!result.ok) {
            return Result.err({ kind: "tauri", error: result.error });
          }
          // 世代検証 + unmount safeguard
          if (!isMountedRef.current || generationRef.current !== startGen) {
            return invalidStateErr<Task>("プロジェクトが切り替わりました");
          }
          dispatchSync({ type: "task-created", task: result.value });
          return Result.ok(result.value);
        },
      );
      openQueueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [dispatchSync],
  );

  const updateTask = useCallback(
    (params: UpdateTaskParams): Promise<ResultT<Task, ProjectError>> => {
      const snapshot = stateRef.current;
      if (!acceptsCrud(snapshot)) {
        return Promise.resolve(invalidStateErr<Task>());
      }
      const startGen = generationRef.current;
      const queued = openQueueRef.current.then(
        async (): Promise<ResultT<Task, ProjectError>> => {
          if (!isMountedRef.current || generationRef.current !== startGen) {
            return invalidStateErr<Task>("プロジェクトが切り替わりました");
          }
          const result = await updateTaskInvoke(params);
          if (!result.ok) {
            return Result.err({ kind: "tauri", error: result.error });
          }
          if (!isMountedRef.current || generationRef.current !== startGen) {
            return invalidStateErr<Task>("プロジェクトが切り替わりました");
          }
          dispatchSync({
            type: "task-updated",
            originalFilePath: params.filePath,
            task: result.value,
          });
          return Result.ok(result.value);
        },
      );
      openQueueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [dispatchSync],
  );

  const deleteTask = useCallback(
    (params: DeleteTaskParams): Promise<ResultT<void, ProjectError>> => {
      const snapshot = stateRef.current;
      if (!acceptsCrud(snapshot)) {
        return Promise.resolve(invalidStateErr<void>());
      }
      const startGen = generationRef.current;
      const queued = openQueueRef.current.then(
        async (): Promise<ResultT<void, ProjectError>> => {
          if (!isMountedRef.current || generationRef.current !== startGen) {
            return invalidStateErr<void>("プロジェクトが切り替わりました");
          }
          const result = await deleteTaskInvoke(params);
          if (!result.ok) {
            return Result.err({ kind: "tauri", error: result.error });
          }
          if (!isMountedRef.current || generationRef.current !== startGen) {
            return invalidStateErr<void>("プロジェクトが切り替わりました");
          }
          dispatchSync({ type: "task-deleted", filePath: params.filePath });
          return Result.ok(undefined);
        },
      );
      openQueueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [dispatchSync],
  );

  const updateColumns = useCallback(
    (
      input: UpdateColumnsInput,
    ): Promise<ResultT<{ applied: boolean }, ProjectError>> => {
      if (!acceptsCrud(stateRef.current)) {
        return Promise.resolve(invalidStateErr<{ applied: boolean }>());
      }
      // enqueue 時点の世代を捕捉。queue 実行までに別プロジェクトへ切り替わったら
      // この op は破棄する（旧プロジェクトの操作意図を新プロジェクトに反映しない）。
      const enqueueGen = generationRef.current;
      const next = columnsQueueRef.current.then(
        async (): Promise<ResultT<{ applied: boolean }, ProjectError>> => {
          // updater を読む前に openQueueRef を await する。
          // これをしないと、先に enqueue された CRUD (例: 同じ column への
          // task-created) がまだ dispatch されておらず、updater が古い
          // ProjectData (新タスク欠落) で params を計算してしまう。例えば
          // 「column X を削除して残タスクを Y に rename」する updater が、
          // X に enqueue 済みの新タスクを見落として rename 漏れになり、
          // BE 側で orphan task を生む可能性がある。
          await openQueueRef.current;
          // queue 実行時の最新 state から param を決定する。
          // loading + previousLoaded のときは previousLoaded.data を data source
          // として使う (Board が previousLoaded.data で表示されているため)
          const snapshot = stateRef.current;
          if (!acceptsCrud(snapshot)) {
            return invalidStateErr<{ applied: boolean }>();
          }
          if (generationRef.current !== enqueueGen) {
            return invalidStateErr<{ applied: boolean }>(
              "プロジェクトが切り替わりました",
            );
          }
          // 表示中の data (loaded.data または previousLoaded.data) を取得。
          // acceptsCrud で gate しているため必ず存在する。
          const visibleData = visibleProjectData(snapshot);
          if (visibleData === null) {
            return invalidStateErr<{ applied: boolean }>();
          }
          const startGen = generationRef.current;
          // updater が throw した場合に Promise が reject すると Result contract
          // が破れるため、try/catch で Result.err に詰め直す。
          let params: UpdateColumnsParams | null;
          try {
            params = isUpdater(input) ? input(visibleData) : input;
          } catch (e) {
            return Result.err({ kind: "tauri", error: TauriError.from(e) });
          }
          if (params === null) {
            // updater が null を返した: 適用すべき変更なし。invoke 未実行 = applied:false
            return Result.ok({ applied: false });
          }
          // doneColumn-sensitive 操作 (rename or column 削除) で doneColumn 未取得 +
          // params.doneColumn 未指定の場合のみ defensive refetch する。
          // 単純な column 追加など safe な操作では BE が doneColumn を preserve するため
          // refetch しない (refetch 失敗で safe な操作まで blocking しない)。
          const doneColumnSensitive = isDoneColumnSensitive(
            visibleData.columns,
            params,
          );
          if (
            doneColumnSensitive &&
            visibleData.doneColumn === undefined &&
            params.doneColumn === undefined
          ) {
            const refresh = await getColumnsInvoke();
            // refetch await 中に project が切り替わった場合は、stale snapshot で
            // 続行すると新プロジェクトを上書きしてしまうため、ここで abort する。
            if (!isMountedRef.current || generationRef.current !== enqueueGen) {
              return invalidStateErr<{ applied: boolean }>(
                "プロジェクトが切り替わりました",
              );
            }
            if (!refresh.ok) {
              // refetch 失敗: doneColumn 不明のまま rename/delete を進めると BE が
              // stale doneColumn を保持し config 破壊リスク。Result.err で abort し
              // caller に retry を促す。
              return Result.err({ kind: "tauri", error: refresh.error });
            }
            // 取得できたので state にも反映し、updater を enriched data で再実行する
            // (App handler は current.doneColumn を見て params.doneColumn を計算する
            // ため、enrichment 後の再実行で正しい doneColumn が得られる)。
            const enrichedData: ProjectData = {
              ...visibleData,
              doneColumn: refresh.value.doneColumn,
            };
            dispatchSync({
              type: "done-column-refreshed",
              doneColumn: refresh.value.doneColumn,
            });
            try {
              params = isUpdater(input) ? input(enrichedData) : input;
            } catch (e) {
              return Result.err({
                kind: "tauri",
                error: TauriError.from(e),
              });
            }
            if (params === null) {
              return Result.ok({ applied: false });
            }
          }
          // 削除する column が現在の doneColumn なのに params.doneColumn を未指定で
          // invoke すると BE は doneColumn を preserve し、削除された column 名を
          // doneColumn として保持し続ける config 破壊バグになる。caller が
          // 忘れた場合でも hook が defensive に拒否する。
          // (visibleData.doneColumn が known で、refetch を経ていないパスでも保護)
          const knownDoneColumn = visibleProjectData(
            stateRef.current,
          )?.doneColumn;
          if (
            knownDoneColumn !== undefined &&
            !params.columns.some((c) => c.name === knownDoneColumn) &&
            params.doneColumn === undefined
          ) {
            return Result.err({
              kind: "invalid-state",
              message:
                "doneColumn を削除する操作は新 doneColumn を params.doneColumn で指定する必要があります",
            });
          }
          // 明示的 params.doneColumn は params.columns に必ず含まれていなければ
          // ならない (BE 側 Config::resolved_done_column は不在の値も preserve する
          // ため、stale / typo を invoke 前に reject して config 破壊を防ぐ)。
          if (
            params.doneColumn !== undefined &&
            !params.columns.some((c) => c.name === params.doneColumn)
          ) {
            return Result.err({
              kind: "invalid-state",
              message: `params.doneColumn "${params.doneColumn}" は params.columns に存在しません`,
            });
          }
          // pending 中の open_project を待つ (defense in depth)
          // BE invoke + dispatch を openQueueRef にチェーンして
          // 「await openQueueRef → invoke 前の race」を完全に排除する。
          // 以後の openProject はこの invoke 完了を待つ。
          const innerQueued = openQueueRef.current.then(
            async (): Promise<ResultT<{ applied: boolean }, ProjectError>> => {
              if (!isMountedRef.current || generationRef.current !== startGen) {
                return invalidStateErr<{ applied: boolean }>(
                  "プロジェクトが切り替わりました",
                );
              }
              const result = await updateColumnsInvoke({
                columns: params.columns,
                renames: params.renames,
                doneColumn: params.doneColumn,
              });
              if (!result.ok) {
                return Result.err({ kind: "tauri", error: result.error });
              }
              if (!isMountedRef.current || generationRef.current !== startGen) {
                return invalidStateErr<{ applied: boolean }>(
                  "プロジェクトが切り替わりました",
                );
              }
              dispatchSync({
                type: "columns-replaced",
                columns: params.columns,
                renames: params.renames,
                doneColumn: params.doneColumn,
              });
              return Result.ok({ applied: true });
            },
          );
          openQueueRef.current = innerQueued.catch(() => undefined);
          return innerQueued;
        },
      );
      columnsQueueRef.current = next.catch(() => undefined);
      return next;
    },
    [dispatchSync],
  );

  const reset = useCallback((): void => {
    requestIdRef.current += 1;
    bumpGeneration();
    dispatchSync({ type: "reset" });
  }, [dispatchSync, bumpGeneration]);

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
