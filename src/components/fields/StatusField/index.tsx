import { PopoverSelect } from "@/components/PopoverSelect";
import { ColumnColor } from "@/domains/column-color";
import type { Column } from "@/types/column";

/** StatusField の Props */
export type StatusFieldProps = {
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 現在値（カラム名） */
  value: string;
  /**
   * 選択変更時のコールバック。
   * @param value - 選択されたカラム名
   */
  onChange: (value: string) => void;
  /** 無効化（既定 false） */
  disabled?: boolean;
};

/**
 * ステータス選択フィールド（作成・編集共用の唯一実装）。
 * columns から option を生成し、色帯はボードのカラム色帯と同一ロジック
 * （{@link ColumnColor.resolveAccent}）で解決する。値の制御は `value` / `onChange`。
 * @param props - {@link StatusFieldProps}
 * @returns ステータス選択 UI
 */
export const StatusField = ({
  columns,
  value,
  onChange,
  disabled = false,
}: StatusFieldProps) => {
  return (
    <PopoverSelect
      label="ステータス"
      required
      options={columns.map((col, index) => ({
        value: col.name,
        label: col.name,
        swatchColor: ColumnColor.resolveAccent(col.color, index),
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      data-testid="status-field"
    />
  );
};
