import type { Column } from "@/types/column";

/** get_columns 戻り値ペイロード。 */
export type GetColumnsPayload = {
  /** カラム定義の配列（order 昇順を期待） */
  columns: Column[];
  /** 完了として扱うカラム名 */
  doneColumn: string;
};

/** カラム名のリネーム指示。 */
export type ColumnRename = {
  /** 旧カラム名 */
  from: string;
  /** 新カラム名 */
  to: string;
};

/** update_columns 引数（全フィールド任意）。 */
export type UpdateColumnsParams = {
  /** 上書きするカラム定義一覧（追加・削除・並び替え） */
  columns?: Column[];
  /** 完了として扱うカラム名 */
  doneColumn?: string;
  /** カラム名のリネーム指示一覧（タスク status の一括書き換え） */
  renames?: ColumnRename[];
};
