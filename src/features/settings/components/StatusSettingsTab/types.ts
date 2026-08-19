/** 設定画面で編集するボードカラム。 */
export type StatusColumn = {
  id: string;
  /** rename前のproject column名。新規columnでは未指定。 */
  sourceName?: string;
  name: string;
  taskCount: number;
  color: string;
  /** WIP 上限（1 以上の整数）。未指定は制限なし。 */
  wipLimit?: number;
};

/** 保存callbackへ渡すステータス設定。 */
export type StatusSettingsValue = {
  columns: readonly StatusColumn[];
  doneColumn: string;
};
