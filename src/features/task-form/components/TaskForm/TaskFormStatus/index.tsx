import { ColumnColor } from "@/domains/column-color";
import type { Column } from "@/types/column";
import { ChipRadioGroup } from "../ChipRadioGroup";

type TaskFormStatusProps = {
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 現在値 */
  value: string;
  /**
   * 選択変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string) => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * タスクステータス選択フィールド。
 * columns からチップを生成する pure な子コンポーネント。
 * チップ色はボードのカラム色帯と同一ロジック（ColumnColor.resolveAccent）で解決する。
 * @param props - {@link TaskFormStatusProps}
 * @returns ステータス選択 UI
 */
export const TaskFormStatus = ({
  columns,
  value,
  onChange,
  disabled,
}: TaskFormStatusProps) => {
  return (
    <ChipRadioGroup
      label="ステータス"
      required
      options={columns.map((col, index) => ({
        value: col.name,
        label: col.name,
        accentColor: ColumnColor.resolveAccent(col.color, index),
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      data-testid="task-form-status"
    />
  );
};
