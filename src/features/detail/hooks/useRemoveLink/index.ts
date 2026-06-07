import { useCallback, useState } from "react";
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
 * DetailScreen の関連タスク削除 UI 用フック。`isBusy` を管理するだけの薄い wrapper。
 *
 * 連続発火の防止は呼び出し側の LinksSection が button disabled で行う。
 * 万一同時呼出が起きても downstream `removeLinkAction` は `enqueueProjectCommand`
 * で直列化され、整合性は保たれる。
 *
 * @param args - {@link UseRemoveLinkArgs}
 * @returns {@link UseRemoveLinkResult}
 */
export const useRemoveLink = (args: UseRemoveLinkArgs): UseRemoveLinkResult => {
  const [isBusy, setIsBusy] = useState(false);

  const removeLink = useCallback(
    async (targetFilePath: string) => {
      setIsBusy(true);
      try {
        await args.onRemoveLink(targetFilePath);
      } finally {
        setIsBusy(false);
      }
    },
    [args.onRemoveLink],
  );

  return { isBusy, removeLink };
};
