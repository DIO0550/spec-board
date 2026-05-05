import type { TauriError } from "@/lib/tauri";
import type { ProjectData } from "./projectData";

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
   * CRUD / column 更新を受け付けられる state か判定する。
   *
   * @param state 現在の ProjectState
   * @returns loaded なら true
   */
  canAcceptCrud: (state: ProjectState): boolean => state.kind === "loaded",

  /**
   * UI と command builder が参照できる ProjectData を取り出す。
   *
   * @param state 現在の ProjectState
   * @returns loaded の data、それ以外なら null
   */
  visibleData: (state: ProjectState): ProjectData | null =>
    state.kind === "loaded" ? state.data : null,

  /**
   * project open 開始時の loading state を作る。
   *
   * @param _state 現在の ProjectState
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
      return { ...state, data: update(state.data) };
    }
    if (state.kind === "loading" && state.previousLoaded !== undefined) {
      return {
        ...state,
        previousLoaded: {
          path: state.previousLoaded.path,
          data: update(state.previousLoaded.data),
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
