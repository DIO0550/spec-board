import type { TaskFilePath } from "@/types/task";

/** add_link 引数。source / target ともに解決済みcanonical path。 */
export type AddLinkParams = {
  /** リンク元タスクのファイルパス */
  sourceFilePath: TaskFilePath;
  /** リンク先タスクのファイルパス */
  targetFilePath: TaskFilePath;
};

/** remove_link 引数。targetはfrontmatterから選ばれたraw linkを保持する。 */
export type RemoveLinkParams = {
  /** リンク元タスクのファイルパス */
  sourceFilePath: TaskFilePath;
  /** 削除するリンクのraw表記 */
  targetFilePath: string;
};

/** remove_link互換の共通名。 */
export type LinkParams = RemoveLinkParams;
