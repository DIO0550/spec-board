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
 * `string[]` のカラム名一覧を 0 始まりの order 付き Column[] に変換する。
 *
 * @param names カラム名一覧（既に並び順が保たれている前提）
 * @returns Column[]
 */
const toColumns = (names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

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
   * - dialog plugin 例外 / openProject invoke 失敗（previousLoaded なしの error 遷移時）
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

    const invokeResult = await openProjectInvoke({ path });

    if (!isMountedRef.current) {
      return;
    }
    if (myId !== requestIdRef.current) {
      // 後勝ち破棄
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
    // get_columns 失敗時は doneColumn=undefined のまま loaded に進む（rename/delete
    // 連動が effective でなくなるが Board 表示は止めない）。
    const columnsResult = await getColumnsInvoke();
    if (!isMountedRef.current) {
      return;
    }
    if (myId !== requestIdRef.current) {
      return;
    }

    const data: ProjectData = {
      tasks: invokeResult.value.tasks,
      columns: columnsResult.ok
        ? columnsResult.value.columns
        : toColumns(invokeResult.value.columns),
      doneColumn: columnsResult.ok ? columnsResult.value.doneColumn : undefined,
    };
    bumpGeneration();
    dispatchSync({ type: "open-succeed", path, data });
  }, [onError, dispatchSync, bumpGeneration]);

  const createTask = useCallback(
    async (params: CreateTaskParams): Promise<ResultT<Task, ProjectError>> => {
      const snapshot = stateRef.current;
      if (snapshot.kind !== "loaded") {
        return invalidStateErr<Task>();
      }
      const startGen = generationRef.current;
      const result = await createTaskInvoke(params);
      if (!result.ok) {
        return Result.err({ kind: "tauri", error: result.error });
      }
      // 世代検証: invoke 中にプロジェクトが切り替わっていたら state は更新しない
      if (
        stateRef.current.kind !== "loaded" ||
        generationRef.current !== startGen
      ) {
        return invalidStateErr<Task>("プロジェクトが切り替わりました");
      }
      dispatchSync({ type: "task-created", task: result.value });
      return Result.ok(result.value);
    },
    [dispatchSync],
  );

  const updateTask = useCallback(
    async (params: UpdateTaskParams): Promise<ResultT<Task, ProjectError>> => {
      const snapshot = stateRef.current;
      if (snapshot.kind !== "loaded") {
        return invalidStateErr<Task>();
      }
      const startGen = generationRef.current;
      const result = await updateTaskInvoke(params);
      if (!result.ok) {
        return Result.err({ kind: "tauri", error: result.error });
      }
      if (
        stateRef.current.kind !== "loaded" ||
        generationRef.current !== startGen
      ) {
        return invalidStateErr<Task>("プロジェクトが切り替わりました");
      }
      dispatchSync({
        type: "task-updated",
        originalFilePath: params.filePath,
        task: result.value,
      });
      return Result.ok(result.value);
    },
    [dispatchSync],
  );

  const deleteTask = useCallback(
    async (params: DeleteTaskParams): Promise<ResultT<void, ProjectError>> => {
      const snapshot = stateRef.current;
      if (snapshot.kind !== "loaded") {
        return invalidStateErr<void>();
      }
      const startGen = generationRef.current;
      const result = await deleteTaskInvoke(params);
      if (!result.ok) {
        return Result.err({ kind: "tauri", error: result.error });
      }
      if (
        stateRef.current.kind !== "loaded" ||
        generationRef.current !== startGen
      ) {
        return invalidStateErr<void>("プロジェクトが切り替わりました");
      }
      dispatchSync({ type: "task-deleted", filePath: params.filePath });
      return Result.ok(undefined);
    },
    [dispatchSync],
  );

  const updateColumns = useCallback(
    (
      input: UpdateColumnsInput,
    ): Promise<ResultT<{ applied: boolean }, ProjectError>> => {
      if (stateRef.current.kind !== "loaded") {
        return Promise.resolve(invalidStateErr<{ applied: boolean }>());
      }
      // enqueue 時点の世代を捕捉。queue 実行までに別プロジェクトへ切り替わったら
      // この op は破棄する（旧プロジェクトの操作意図を新プロジェクトに反映しない）。
      const enqueueGen = generationRef.current;
      const next = columnsQueueRef.current.then(
        async (): Promise<ResultT<{ applied: boolean }, ProjectError>> => {
          // queue 実行時の最新 state から param を決定する
          const snapshot = stateRef.current;
          if (snapshot.kind !== "loaded") {
            return invalidStateErr<{ applied: boolean }>();
          }
          if (generationRef.current !== enqueueGen) {
            return invalidStateErr<{ applied: boolean }>(
              "プロジェクトが切り替わりました",
            );
          }
          // doneColumn 未取得 (initial get_columns が失敗等) の場合、updater が
          // current.doneColumn === oldName 判定で常に false になり、rename/delete
          // 時の doneColumn 連動が無効化される。defensive に再 fetch を試みる。
          let effectiveData = snapshot.data;
          if (effectiveData.doneColumn === undefined) {
            const refresh = await getColumnsInvoke();
            // refetch await 中に project が切り替わった場合は、stale snapshot で
            // 続行すると新プロジェクトを上書きしてしまうため、ここで abort する。
            if (!isMountedRef.current || generationRef.current !== enqueueGen) {
              return invalidStateErr<{ applied: boolean }>(
                "プロジェクトが切り替わりました",
              );
            }
            if (refresh.ok) {
              effectiveData = {
                ...effectiveData,
                doneColumn: refresh.value.doneColumn,
              };
              dispatchSync({
                type: "done-column-refreshed",
                doneColumn: refresh.value.doneColumn,
              });
            } else {
              // refetch も失敗した: doneColumn 不明のまま update_columns を呼ぶと
              // BE が stale doneColumn を保持し、rename/delete で削除した column を
              // doneColumn として持ち続ける config 破壊リスクがある。安全のため
              // ここで Result.err を返し caller に retry を促す。
              return Result.err({ kind: "tauri", error: refresh.error });
            }
          }
          const startGen = generationRef.current;
          // updater が throw した場合に Promise が reject すると Result contract
          // が破れるため、try/catch で Result.err に詰め直す。
          let params: UpdateColumnsParams | null;
          try {
            params = isUpdater(input) ? input(effectiveData) : input;
          } catch (e) {
            return Result.err({ kind: "tauri", error: TauriError.from(e) });
          }
          if (params === null) {
            // updater が null を返した: 適用すべき変更なし。invoke 未実行 = applied:false
            return Result.ok({ applied: false });
          }
          const result = await updateColumnsInvoke({
            columns: params.columns,
            renames: params.renames,
            doneColumn: params.doneColumn,
          });
          if (!result.ok) {
            return Result.err({ kind: "tauri", error: result.error });
          }
          if (
            stateRef.current.kind !== "loaded" ||
            generationRef.current !== startGen
          ) {
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
