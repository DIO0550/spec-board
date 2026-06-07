import { useCallback, useReducer } from "react";
import { LinksField } from "@/features/task-form/lib/fields/links";

/**
 * useLinksInput の dispatch が受け付ける action。
 * React 固有の discriminated union で、domain（LinksField）とは切り離す。
 */
export type LinksAction =
  | { type: "add"; filePath: string }
  | { type: "remove"; filePath: string };

/**
 * `useReducer` 用のローカル reducer。domain の pure ops にディスパッチするだけ。
 * @param state - 現在の状態
 * @param action - 操作
 * @returns 新しい状態
 */
const reducer = (state: LinksField, action: LinksAction): LinksField => {
  switch (action.type) {
    case "add":
      return LinksField.add(state, action.filePath);
    case "remove":
      return LinksField.remove(state, action.filePath);
    default: {
      action satisfies never;
      return state;
    }
  }
};

/** useLinksInput の返却値 */
export type UseLinksInputResult = {
  /** 選択済み関連タスクの filePath 一覧 */
  links: string[];
  /**
   * 関連タスクを追加する。空文字・既存重複は no-op（dedup）。
   * @param filePath - 追加する関連タスクの filePath
   */
  addLink: (filePath: string) => void;
  /**
   * 関連タスクを除外する。
   * @param filePath - 削除対象の filePath
   */
  removeLink: (filePath: string) => void;
  /**
   * submit 用に最終 links を同期で返す。ピッカーは即時 commit のため
   * 現 state をそのまま返す（`finalizeLabels` と同じ役割）。
   * @returns 最終 links 配列
   */
  finalizeLinks: () => string[];
};

/**
 * 関連タスク（links）入力用の state を `useReducer` で管理するカスタムフック。
 * 状態遷移のドメインロジックは `LinksField` の pure ops に委譲する。
 *
 * 候補算出は parent に依存するため本フックには持たせず、`TaskForm` 側で
 * `values.parent` 確定後に行う（`useLinksInput → useTaskFormFields → useLinksInput`
 * の循環依存を避けるため）。本フックは parent に依存しない。
 * @param initialLinks - 初期 links 配列
 * @returns links 入力フック結果
 */
export const useLinksInput = (
  initialLinks: string[] = [],
): UseLinksInputResult => {
  const [state, dispatch] = useReducer(reducer, initialLinks, LinksField.empty);

  const addLink = useCallback((filePath: string) => {
    dispatch({ type: "add", filePath });
  }, []);

  const removeLink = useCallback((filePath: string) => {
    dispatch({ type: "remove", filePath });
  }, []);

  const finalizeLinks = useCallback(
    (): string[] => LinksField.finalize(state),
    [state],
  );

  return { links: state.links, addLink, removeLink, finalizeLinks };
};
