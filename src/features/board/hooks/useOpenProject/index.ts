import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  type OpenProjectPayload,
  openProject,
  type TauriError,
} from "@/lib/tauri";

/**
 * useOpenProject hook の状態（discriminated union）。
 * - idle: 未選択
 * - loading: invoke 実行中（path 保持）
 * - loaded: 成功（path / data 保持）
 * - error: 失敗（path / error 保持）
 */
export type OpenProjectState =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "loaded"; path: string; data: OpenProjectPayload }
  | { kind: "error"; path: string; error: TauriError };

/**
 * reducer 内部で扱う action（hook の内部実装詳細のため export しない）。
 */
type OpenProjectAction =
  | { type: "start"; path: string }
  | { type: "succeed"; path: string; data: OpenProjectPayload }
  | { type: "fail"; path: string; error: TauriError }
  | { type: "reset" };

const initialState: OpenProjectState = { kind: "idle" };

/**
 * useReducer 用の pure な遷移関数。React 非依存で単体テスト可能。
 * `default` 句の `action satisfies never` で action 種別の網羅性を型レベルで保証する。
 *
 * @internal hook 内部実装だが behavior.test.ts から import するため module export する。
 *           features barrel (src/features/board/index.ts) からは re-export しない。
 *
 * @param state 現在の状態
 * @param action 適用する action
 * @returns 次の状態
 */
export const reducer = (
  state: OpenProjectState,
  action: OpenProjectAction,
): OpenProjectState => {
  switch (action.type) {
    case "start":
      return { kind: "loading", path: action.path };
    case "succeed":
      return { kind: "loaded", path: action.path, data: action.data };
    case "fail":
      return { kind: "error", path: action.path, error: action.error };
    case "reset":
      return { kind: "idle" };
    default: {
      action satisfies never;
      return state;
    }
  }
};

/**
 * useOpenProject hook のオプション引数。
 */
export type UseOpenProjectOptions = {
  /**
   * 失敗時に 1 度だけ呼ばれる汎用エラーコールバック（optional）。
   * Toast 表示やログなど通知方法は呼び出し側に委ねる。
   * 後勝ちキャンセル / アンマウント時には呼ばれない。
   */
  onError?: (error: TauriError) => void;
};

/**
 * useOpenProject hook の戻り値。
 */
export type UseOpenProjectResult = {
  /** 現在の状態 */
  state: OpenProjectState;
  /**
   * プロジェクトディレクトリを開く。後勝ちキャンセル / アンマウント safeguard 付き。
   * @param path プロジェクトディレクトリの絶対パス
   * @returns invoke の解決を待つ Promise（state 反映は requestId 一致時のみ）
   */
  open: (path: string) => Promise<void>;
  /** 任意状態から idle に戻す（in-flight resolve は requestId を進めて破棄） */
  reset: () => void;
};

/**
 * useOpenProject — プロジェクトディレクトリを開く状態マシン hook。
 *
 * idle / loading / loaded / error の 4 状態を管理し、`open(path)` / `reset()` で遷移する。
 * 失敗時は optional な `onError(error)` コールバックを 1 度だけ呼ぶ。
 * 後勝ちキャンセル（`useRef<number>` リクエスト ID 方式）とアンマウント safeguard
 * （useEffect cleanup で ID を進める）を 1 つの ID 機構で兼ねる。
 *
 * @param options hook オプション（onError は optional）
 * @returns state / open / reset を持つ result
 */
export const useOpenProject = (
  options: UseOpenProjectOptions = {},
): UseOpenProjectResult => {
  const { onError } = options;
  const [state, dispatch] = useReducer(reducer, initialState);
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const open = useCallback(
    async (path: string): Promise<void> => {
      requestIdRef.current += 1;
      const myId = requestIdRef.current;
      dispatch({ type: "start", path });

      const result = await openProject({ path });

      if (myId !== requestIdRef.current) {
        return;
      }

      if (!result.ok) {
        dispatch({ type: "fail", path, error: result.error });
        onError?.(result.error);
        return;
      }

      dispatch({ type: "succeed", path, data: result.value });
    },
    [onError],
  );

  const reset = useCallback((): void => {
    requestIdRef.current += 1;
    dispatch({ type: "reset" });
  }, []);

  return { state, open, reset };
};
