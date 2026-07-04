import { initialState, type ProjectAction, reducer } from "./reducer";
import type { ProjectState } from "./state/projectState";

/**
 * React 外で project state の本体を保持する store。
 * Provider は `useSyncExternalStore` で購読し、async command / listen callback は
 * `getState()` で最新 state を同期的に読む（真実は store の 1 箇所のみ）。
 */
export type ProjectStore = {
  /** 現在の state を同期的に返す。 */
  getState: () => ProjectState;
  /**
   * reducer を適用して state を更新し、登録済み listener を同期的に通知する。
   * dispatch 直後の `getState()`（listener 内含む）は新 state を返す。
   * @param action 反映する ProjectAction
   */
  dispatch: (action: ProjectAction) => void;
  /**
   * state 変化の listener を登録する。
   * @param listener state 変化時に呼ばれる callback
   * @returns 購読解除関数
   */
  subscribe: (listener: () => void) => () => void;
};

/**
 * project state store を生成する。React 非依存の素の TS。
 * `getState` / `dispatch` / `subscribe` は生成時の closure なので、
 * store の生涯にわたり同一 identity（`useSyncExternalStore` の要件を満たす）。
 *
 * @returns 生成した ProjectStore
 */
export const createProjectStore = (): ProjectStore => {
  let state: ProjectState = initialState;
  const listeners = new Set<() => void>();

  const getState = (): ProjectState => state;

  const dispatch = (action: ProjectAction): void => {
    state = reducer(state, action);
    // Set.forEach は通知中に解除された未走査 listener を呼ばない（安全に無視する）。
    listeners.forEach((listener) => {
      listener();
    });
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, dispatch, subscribe };
};
