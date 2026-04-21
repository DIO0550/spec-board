/** ParentField が保持する値の型（親タスクのファイルパス、または未選択） */
export type ParentValue = string | undefined;

/**
 * 親タスク field の companion object。
 * parent フィールドの可視性と初期値から現在値を計算する pure function を提供する。
 */
export const ParentField = {
  /**
   * 初期値を返す。フィールドが非表示なら常に undefined。
   * @param visible - 親タスクフィールドが表示されるかどうか
   * @param initialParent - 初期値（visible のときのみ使用）
   * @returns 親タスクのパスまたは undefined
   */
  initial: (visible: boolean, initialParent?: string): ParentValue =>
    visible ? initialParent : undefined,
};
