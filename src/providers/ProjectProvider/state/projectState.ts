import type { ProjectData } from "@/domains/project-data";
import type { TauriError } from "@/lib/tauri";

export type ProjectState =
  | { kind: "idle" }
  | {
      kind: "loading";
      path: string;
      previousLoaded?: { path: string; data: ProjectData };
    }
  | { kind: "loaded"; path: string; data: ProjectData }
  | { kind: "error"; path: string; error: TauriError };

type ProjectDataMapper = (data: ProjectData) => ProjectData;

export const ProjectState = {
  initial: { kind: "idle" } satisfies ProjectState,

  /**
   * task / column command を受け付けられる state か判定する。
   *
   * @param state 現在の ProjectState
   * @returns loaded または loading.previousLoaded なら true
   */
  canAcceptDataCommand: (state: ProjectState): boolean =>
    state.kind === "loaded" ||
    (state.kind === "loading" && state.previousLoaded !== undefined),

  /**
   * UI と command builder が参照できる ProjectData を取り出す。
   *
   * @param state 現在の ProjectState
   * @returns loaded の data、loading.previousLoaded の data、それ以外なら null
   */
  visibleData: (state: ProjectState): ProjectData | null => {
    if (state.kind === "loaded") {
      return state.data;
    }
    if (state.kind === "loading" && state.previousLoaded !== undefined) {
      return state.previousLoaded.data;
    }
    return null;
  },

  /**
   * project open 開始時の loading state を作る。
   *
   * @param state 現在の ProjectState
   * @param path open 対象 path
   * @returns previousLoaded を退避した loading state
   */
  openStart: (state: ProjectState, path: string): ProjectState => {
    const previousLoaded =
      state.kind === "loaded"
        ? { path: state.path, data: state.data }
        : state.kind === "loading"
          ? state.previousLoaded
          : undefined;
    return { kind: "loading", path, previousLoaded };
  },

  /**
   * project open 成功時の loaded state を作る。
   *
   * @param path open した project path
   * @param data 読み込んだ ProjectData
   * @returns loaded state
   */
  openSucceed: (path: string, data: ProjectData): ProjectState => ({
    kind: "loaded",
    path,
    data,
  }),

  /**
   * project open 失敗時の state を作る。
   *
   * @param state 現在の ProjectState
   * @param path open に失敗した project path
   * @param error Tauri command 由来の error
   * @returns previousLoaded があれば loaded に復元し、なければ error state
   */
  openFail: (
    state: ProjectState,
    path: string,
    error: TauriError,
  ): ProjectState => {
    if (state.kind === "loading" && state.previousLoaded !== undefined) {
      return {
        kind: "loaded",
        path: state.previousLoaded.path,
        data: state.previousLoaded.data,
      };
    }
    return { kind: "error", path, error };
  },

  /**
   * loaded state の ProjectData だけを更新する。
   *
   * @param state 現在の ProjectState
   * @param update ProjectData の変換関数
   * @returns loaded / loading.previousLoaded なら data 更新後 state、それ以外は元 state
   */
  updateData: (
    state: ProjectState,
    update: ProjectDataMapper,
  ): ProjectState => {
    if (state.kind === "loaded") {
      const next = update(state.data);
      // 派生値が完全に据え置かれたケース（等価 projection の再同期 / 未ヒットの
      // task-updated / 空カラムの card-order-updated）で新しい state を作らない。
      // store.dispatch は listener を無条件に通知するため、ここで参照を保たないと
      // useSyncExternalStore が全ツリーを再レンダーし、ProjectData 側の参照据え置きが
      // 無意味になる。
      if (next === state.data) {
        return state;
      }
      return { ...state, data: next };
    }
    if (state.kind === "loading" && state.previousLoaded !== undefined) {
      const next = update(state.previousLoaded.data);
      if (next === state.previousLoaded.data) {
        return state;
      }
      return {
        ...state,
        previousLoaded: {
          path: state.previousLoaded.path,
          data: next,
        },
      };
    }
    return state;
  },

  /**
   * project state を初期 idle に戻す。
   *
   * @returns idle state
   */
  reset: (): ProjectState => ProjectState.initial,
} as const;
