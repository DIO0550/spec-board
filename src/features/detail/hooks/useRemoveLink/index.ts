import { useCallback, useRef, useState } from "react";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";

/** useRemoveLink 引数。 */
export type UseRemoveLinkArgs = {
  /**
   * リンク削除の実呼び出し callback。LinksSection が source filePath を bind した形で渡す。
   *
   * @param targetFilePath 削除対象 link の対向 filePath
   * @returns invoke 結果
   */
  readonly onRemoveLink: (
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/** useRemoveLink の戻り値。 */
export type UseRemoveLinkResult = {
  /** 削除中フラグ（UI disable 用） */
  readonly isBusy: boolean;
  /**
   * × ボタン押下で呼ぶ。invoke 完了まで `isBusy` が `true` になる。
   *
   * @param targetFilePath 削除対象 link の対向 filePath
   */
  readonly removeLink: (targetFilePath: string) => Promise<void>;
};

/**
 * DetailScreen の関連タスク削除 UI 用フック。`isBusy` を管理する薄い wrapper。
 *
 * 実行中の再呼び出しは hook 内の in-flight ガードで短絡する。`isBusy`（state）は
 * 描画に追従するが反映が非同期なため、同一 tick の連打では二重発行を防げない。
 * 同期的に判定できる ref を真の競合制御として併用し、in-flight 中の 2 回目以降は
 * `onRemoveLink` を発行せず即 return する。
 *
 * 呼び出し側 LinksSection の button disabled や downstream `enqueueProjectCommand`
 * 直列化も従来どおり働くが、最後の砦はこの hook 内ガードが担う。
 *
 * @param args - {@link UseRemoveLinkArgs}
 * @returns {@link UseRemoveLinkResult}
 */
export const useRemoveLink = (args: UseRemoveLinkArgs): UseRemoveLinkResult => {
  const [isBusy, setIsBusy] = useState(false);
  // state 反映を待たずに同期判定するための in-flight フラグ。
  const inFlightRef = useRef(false);

  const removeLink = useCallback(
    async (targetFilePath: string) => {
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      setIsBusy(true);
      try {
        await args.onRemoveLink(targetFilePath);
      } finally {
        inFlightRef.current = false;
        setIsBusy(false);
      }
    },
    [args.onRemoveLink],
  );

  return { isBusy, removeLink };
};
