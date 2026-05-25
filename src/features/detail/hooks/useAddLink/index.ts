import { useCallback, useRef, useState } from "react";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";

/** useAddLink 引数。 */
export type UseAddLinkArgs = {
  /**
   * リンク追加の実呼び出し callback。呼び出し元（DetailPanel 経由で App）が
   * source filePath を bind した形で渡す。
   *
   * @param targetFilePath リンク先 filePath
   * @returns invoke 結果
   */
  readonly onAddLink: (
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/** useAddLink の戻り値。 */
export type UseAddLinkResult = {
  /** リンク追加中フラグ（UI disable 用） */
  readonly isBusy: boolean;
  /**
   * 候補選択時に呼ぶ。`useRef` ベースの in-flight guard により同一 tick の連続呼出は
   * 1 回のみ通過する。
   *
   * @param targetFilePath リンク先 filePath
   */
  readonly addLink: (targetFilePath: string) => Promise<void>;
};

/**
 * DetailPanel の関連タスク追加 UI 用フック。二重発火 guard を `useRef` で持つ
 * （`useState(isBusy)` は次 render まで反映されないため、同一 tick の連続呼出を
 * 防ぐには ref が必要）。
 *
 * @param args - {@link UseAddLinkArgs}
 * @returns {@link UseAddLinkResult}
 */
export const useAddLink = (args: UseAddLinkArgs): UseAddLinkResult => {
  const [isBusy, setIsBusy] = useState(false);
  // 同一 tick の連続呼出を 1 回のみ通過させる sync guard。
  // `useState(isBusy)` は次 render まで反映されないため、ref で同期判定する必要がある。
  const inFlightRef = useRef(false);

  const addLink = useCallback(
    async (targetFilePath: string) => {
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      setIsBusy(true);
      try {
        await args.onAddLink(targetFilePath);
      } finally {
        inFlightRef.current = false;
        setIsBusy(false);
      }
    },
    [args.onAddLink],
  );

  return { isBusy, addLink };
};
