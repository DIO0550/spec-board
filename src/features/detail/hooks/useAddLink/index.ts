import { useCallback, useState } from "react";
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
 * DetailScreen の関連タスク追加 UI 用フック。`isBusy` を管理するだけの薄い wrapper。
 *
 * 連続発火の防止は呼び出し側に委ねる:
 * - LinksSection は候補選択で `setIsOpen(false)` し popover を unmount するため
 *   候補ボタンが消える
 * - `+ リンク追加` ボタンは `disabled={isBusy}` で再オープンを抑止する
 * - 万一同時呼出が起きても downstream `addLinkAction` は `enqueueProjectCommand`
 *   で直列化され、`TaskLinks.appendLinkedFilePath` の重複ガードで no-op になる
 *
 * @param args - {@link UseAddLinkArgs}
 * @returns {@link UseAddLinkResult}
 */
export const useAddLink = (args: UseAddLinkArgs): UseAddLinkResult => {
  const [isBusy, setIsBusy] = useState(false);

  const addLink = useCallback(
    async (targetFilePath: string) => {
      setIsBusy(true);
      try {
        await args.onAddLink(targetFilePath);
      } finally {
        setIsBusy(false);
      }
    },
    [args.onAddLink],
  );

  return { isBusy, addLink };
};
