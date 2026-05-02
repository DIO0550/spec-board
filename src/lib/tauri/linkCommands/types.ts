/** add_link / remove_link 共通の引数。 */
export type LinkParams = {
  /** リンク元タスクのファイルパス */
  sourceFilePath: string;
  /** リンク先タスクのファイルパス */
  targetFilePath: string;
};
