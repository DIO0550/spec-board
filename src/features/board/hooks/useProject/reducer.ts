import type { ColumnRename, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

/** プロジェクト state.data の中身（loaded 時のみ存在）。 */
export type ProjectData = {
  tasks: Task[];
  columns: Column[];
  /**
   * 完了として扱うカラム名。BE が open_project 時にまだ返さない場合は undefined。
   * doneColumn を rename した場合は連動して新名に更新する必要がある。
   */
  doneColumn?: string;
};

/**
 * プロジェクト state の discriminated union。
 * - idle: 未 open
 * - loading: open 実行中。`previousLoaded` があれば失敗時に loaded へ復元する
 * - loaded: open 成功。CRUD method はこの状態でのみ動作する
 * - error: 初回 open 失敗（previousLoaded なし）
 */
export type ProjectState =
  | { kind: "idle" }
  | {
      kind: "loading";
      path: string;
      previousLoaded?: { path: string; data: ProjectData };
    }
  | { kind: "loaded"; path: string; data: ProjectData }
  | { kind: "error"; path: string; error: TauriError };

/**
 * reducer 内部で扱う action（hook 内部実装詳細のため barrel から re-export しない）。
 */
export type ProjectAction =
  | { type: "open-start"; path: string }
  | { type: "open-succeed"; path: string; data: ProjectData }
  | { type: "open-fail"; path: string; error: TauriError }
  | { type: "task-created"; task: Task }
  | { type: "task-updated"; originalFilePath: string; task: Task }
  | { type: "task-deleted"; filePath: string }
  | {
      type: "columns-replaced";
      columns: Column[];
      renames?: ColumnRename[];
      /**
       * 新しい doneColumn。undefined のときは既存値を維持する
       * (BE update_columns の "omit すると preserve" セマンティクスに整合)。
       */
      doneColumn?: string;
    }
  | { type: "done-column-refreshed"; doneColumn: string }
  | { type: "reset" };

export const initialState: ProjectState = { kind: "idle" };

/** ProjectData を新しい ProjectData に変換する純粋関数。 */
type ProjectDataUpdater = (data: ProjectData) => ProjectData;

/**
 * `state` の ProjectData に `update` を適用する。
 * - `loaded`: state.data を直接更新
 * - `loading` (previousLoaded あり): previousLoaded.data を更新する
 *   (loaded(A) → loading(B, prev=A) 中に A 上の CRUD が resolve したケースで、
 *    後で previousLoaded への restore が起きても変更が失われないようにする)
 * - それ以外 (idle / error / loading without previousLoaded): state 不変
 *
 * @param state 現在の state
 * @param update ProjectData を新しい ProjectData に変換する純粋関数
 * @returns 更新後の state
 */
const updateProjectData = (
  state: ProjectState,
  update: ProjectDataUpdater,
): ProjectState => {
  if (state.kind === "loaded") {
    return { ...state, data: update(state.data) };
  }
  if (state.kind === "loading" && state.previousLoaded) {
    return {
      ...state,
      previousLoaded: {
        path: state.previousLoaded.path,
        data: update(state.previousLoaded.data),
      },
    };
  }
  return state;
};

/**
 * `renames` を順に適用して `tasks` の status を一括書き換えする。
 * `from` に一致する status を `to` に置換する。
 *
 * @param tasks 対象タスク配列
 * @param renames 適用する rename 指示
 * @returns 書き換え後のタスク配列（参照は新規）
 */
const applyRenamesToTasks = (
  tasks: Task[],
  renames: ColumnRename[],
): Task[] => {
  return renames.reduce<Task[]>(
    (acc, { from, to }) =>
      acc.map((t) => (t.status === from ? { ...t, status: to } : t)),
    tasks,
  );
};

/**
 * useReducer 用の純粋関数。React 非依存で単体テスト可能。
 * `default` 句の `action satisfies never` で網羅性を型レベルで保証する。
 *
 * @param state 現在の state
 * @param action 適用する action
 * @returns 次の state
 */
export const reducer = (
  state: ProjectState,
  action: ProjectAction,
): ProjectState => {
  switch (action.type) {
    case "open-start": {
      // loaded → loading: 直前の loaded を退避
      // loading → loading: 既存の previousLoaded を引き継ぐ
      //   (B を loading 中に C を開いて C が失敗した場合も A に復元できるよう保持する)
      // それ以外: 退避なし
      const previousLoaded =
        state.kind === "loaded"
          ? { path: state.path, data: state.data }
          : state.kind === "loading"
            ? state.previousLoaded
            : undefined;
      return { kind: "loading", path: action.path, previousLoaded };
    }
    case "open-succeed":
      return { kind: "loaded", path: action.path, data: action.data };
    case "open-fail": {
      // Board 維持要件: loading 中に previousLoaded を退避していれば、失敗後に
      // 直前の loaded に復元する。退避がなければ通常通り error へ遷移する。
      if (state.kind === "loading" && state.previousLoaded) {
        return {
          kind: "loaded",
          path: state.previousLoaded.path,
          data: state.previousLoaded.data,
        };
      }
      return { kind: "error", path: action.path, error: action.error };
    }
    case "task-created": {
      // updateProjectData により loaded / loading(prev=A) 双方で適用される
      // (loaded(A) → loading(B, prev=A) 中の CRUD resolve も restore で残るため)
      return updateProjectData(state, (data) => {
        // 親子整合: action.task.parent が指す親タスクの children に新規 filePath を
        // 冪等に追加する（BE が更新済 children を返すまでの FE 側保証）。
        const tasksWithCreated = [...data.tasks, action.task];
        const parentFilePath = action.task.parent;
        const tasksWithParentSync =
          parentFilePath === undefined
            ? tasksWithCreated
            : tasksWithCreated.map((t) =>
                t.filePath === parentFilePath &&
                !t.children.includes(action.task.filePath)
                  ? { ...t, children: [...t.children, action.task.filePath] }
                  : t,
              );
        return { ...data, tasks: tasksWithParentSync };
      });
    }
    case "task-updated": {
      // 照合は invoke 時の lookup key (originalFilePath) を使う。
      // BE が title 由来でファイル名を再生成するなどで filePath が変わっても
      // 既存エントリを正しく差し替えられる。
      return updateProjectData(state, (data) => ({
        ...data,
        tasks: data.tasks.map((t) =>
          t.filePath === action.originalFilePath ? action.task : t,
        ),
      }));
    }
    case "task-deleted": {
      // BE delete_task の orphanStrategy=clear 既定に整合:
      // - 削除対象を除外
      // - 削除対象を parent に持つ task は parent を未設定にする
      // - 他 task の children から削除 filePath を除去（親側のリンクも掃除）
      return updateProjectData(state, (data) => {
        const remaining = data.tasks
          .filter((t) => t.filePath !== action.filePath)
          .map((t) => {
            const parentCleared =
              t.parent === action.filePath ? { ...t, parent: undefined } : t;
            return parentCleared.children.includes(action.filePath)
              ? {
                  ...parentCleared,
                  children: parentCleared.children.filter(
                    (c) => c !== action.filePath,
                  ),
                }
              : parentCleared;
          });
        return { ...data, tasks: remaining };
      });
    }
    case "columns-replaced": {
      return updateProjectData(state, (data) => {
        const renamed = applyRenamesToTasks(data.tasks, action.renames ?? []);
        // doneColumn 既定: action 指定があれば採用、無ければ既存値を維持。
        // 既存値が rename 対象に含まれていれば自動追従する (FE 側保護)。
        const renameMap = new Map(
          (action.renames ?? []).map(({ from, to }) => [from, to]),
        );
        const followedDone =
          data.doneColumn !== undefined
            ? (renameMap.get(data.doneColumn) ?? data.doneColumn)
            : undefined;
        const nextDoneColumn = action.doneColumn ?? followedDone;
        return {
          ...data,
          tasks: renamed,
          columns: action.columns,
          doneColumn: nextDoneColumn,
        };
      });
    }
    case "done-column-refreshed": {
      // BE から取得した doneColumn を state に反映する。
      // 初回 open 時に get_columns が失敗した場合の補完用 (updateColumns queue
      // 内で defensive refetch する際に dispatch される)。
      return updateProjectData(state, (data) => ({
        ...data,
        doneColumn: action.doneColumn,
      }));
    }
    case "reset":
      return { kind: "idle" };
    default: {
      action satisfies never;
      return state;
    }
  }
};
