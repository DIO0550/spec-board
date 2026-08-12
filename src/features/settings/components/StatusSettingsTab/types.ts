/** 設定画面で編集するボードカラム。 */
export type StatusColumn = {
  id: string;
  name: string;
  taskCount: number;
  color: string;
};

/** 保存callbackへ渡すステータス設定。 */
export type StatusSettingsValue = {
  columns: readonly StatusColumn[];
  doneColumn: string;
};
