/** 設定画面で編集するボードカラム。 */
export type StatusColumn = {
  id: string;
  /** rename前のproject column名。新規columnでは未指定。 */
  sourceName?: string;
  name: string;
  taskCount: number;
  color: string;
};

/** 保存callbackへ渡すステータス設定。 */
export type StatusSettingsValue = {
  columns: readonly StatusColumn[];
  doneColumn: string;
};
