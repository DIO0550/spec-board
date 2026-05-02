import type { Column } from "@/types/column";
import type { Result } from "@/utils/result";
import { invokeWrapped } from "../invokeWrapped";
import type { TauriError } from "../tauriError";

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

/**
 * 現在のプロジェクトのカラム定義 / doneColumn を取得する。
 * @returns 成功時は Result.ok({columns, doneColumn})、失敗時は Result.err(TauriError)
 */
export const getColumns = (): Promise<Result<GetColumnsPayload, TauriError>> =>
  invokeWrapped<GetColumnsPayload>("get_columns");

/**
 * カラムの追加・削除・並び替え・リネーム・doneColumn 変更を 1 コマンドで適用する。
 * フィールドはすべて任意で、指定したものだけが更新される。
 * @param params columns / doneColumn / renames（任意）
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const updateColumns = (
  params: UpdateColumnsParams,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("update_columns", params);
