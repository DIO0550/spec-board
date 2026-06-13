import { useCallback, useRef, useState } from "react";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";

/** useAddLink 引数。 */
export type UseAddLinkArgs = {
  /**
   * リンク追加の実呼び出し callback。呼び出し元（DetailScreen 経由で App）が
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
   * 候補選択時に呼ぶ。invoke 完了まで `isBusy` が `true` になる。
   *
   * @param targetFilePath リンク先 filePath
   */
  readonly addLink: (targetFilePath: string) => Promise<void>;
};

/**
 * DetailScreen の関連タスク追加 UI 用フック。`isBusy` を管理する薄い wrapper。
 *
 * 実行中の再呼び出しは hook 内の in-flight ガードで短絡する。`isBusy`（state）は
 * 描画に追従するが反映が非同期なため、同一 tick の連打では `isBusy` を見ても
 * 二重発行を防げない。同期的に判定できる ref を真の競合制御として併用し、
 * in-flight 中の 2 回目以降は `onAddLink` を発行せず即 return する。
 *
 * 呼び出し側の disabled（LinksSection の popover unmount / `disabled={isBusy}`）や
 * downstream の `enqueueProjectCommand` 直列化も従来どおり働くが、最後の砦は
 * この hook 内ガードが担う。
 *
 * @param args - {@link UseAddLinkArgs}
 * @returns {@link UseAddLinkResult}
 */
export const useAddLink = (args: UseAddLinkArgs): UseAddLinkResult => {
  const [isBusy, setIsBusy] = useState(false);
  // state 反映を待たずに同期判定するための in-flight フラグ。
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
