import { useId } from "react";
import type { Column } from "@/types/column";

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
 * columns から option を生成する pure な子コンポーネント。
 * @param props - {@link TaskFormStatusProps}
 * @returns ステータス選択 UI
 */
export const TaskFormStatus = ({
  columns,
  value,
  onChange,
  disabled,
}: TaskFormStatusProps) => {
  const id = useId();
  const statusId = `${id}-status`;
  return (
    <div>
      <label
        htmlFor={statusId}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        ステータス <span className="text-red-600">*</span>
      </label>
      <select
        id={statusId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
        data-testid="task-form-status"
      >
        {columns.map((col) => (
          <option key={col.name} value={col.name}>
            {col.name}
          </option>
        ))}
      </select>
    </div>
  );
};
