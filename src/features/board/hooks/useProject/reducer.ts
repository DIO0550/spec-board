import type { ColumnRename, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

/** プロジェクト state.data の中身（loaded 時のみ存在）。 */
export type ProjectData = {
  tasks: Task[];
  columns: Column[];
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
  | { type: "columns-replaced"; columns: Column[]; renames?: ColumnRename[] }
  | { type: "reset" };

export const initialState: ProjectState = { kind: "idle" };

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
      if (state.kind !== "loaded") {
        return state;
      }
      // 親子整合: action.task.parent が指す親タスクの children に新規 filePath を
      // 冪等に追加する（BE が更新済 children を返すまでの FE 側保証）。
      const tasksWithCreated = [...state.data.tasks, action.task];
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
      return {
        ...state,
        data: { ...state.data, tasks: tasksWithParentSync },
      };
    }
    case "task-updated": {
      if (state.kind !== "loaded") {
        return state;
      }
      // 照合は invoke 時の lookup key (originalFilePath) を使う。
      // BE が title 由来でファイル名を再生成するなどで filePath が変わっても
      // 既存エントリを正しく差し替えられる。
      return {
        ...state,
        data: {
          ...state.data,
          tasks: state.data.tasks.map((t) =>
            t.filePath === action.originalFilePath ? action.task : t,
          ),
        },
      };
    }
    case "task-deleted": {
      if (state.kind !== "loaded") {
        return state;
      }
      return {
        ...state,
        data: {
          ...state.data,
          tasks: state.data.tasks.filter((t) => t.filePath !== action.filePath),
        },
      };
    }
    case "columns-replaced": {
      if (state.kind !== "loaded") {
        return state;
      }
      const renamed = applyRenamesToTasks(
        state.data.tasks,
        action.renames ?? [],
      );
      return {
        ...state,
        data: { ...state.data, tasks: renamed, columns: action.columns },
      };
    }
    case "reset":
      return { kind: "idle" };
    default: {
      action satisfies never;
      return state;
    }
  }
};
