import { useId } from "react";
import type { Priority } from "@/domains/priority";

const PRIORITY_OPTIONS: readonly Priority[] = ["High", "Medium", "Low"];

type TaskFormPriorityProps = {
  /** 現在値（未選択は空文字） */
  value: Priority | "";
  /**
   * 選択変更時のコールバック。
   * @param value - 新しい値（未選択は空文字）
   */
  onChange: (value: Priority | "") => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * タスク優先度選択フィールド。
 * 固定 4 択（なし / High / Medium / Low）を提供する pure な子コンポーネント。
 * @param props - {@link TaskFormPriorityProps}
 * @returns 優先度選択 UI
 */
export const TaskFormPriority = ({
  value,
  onChange,
  disabled,
}: TaskFormPriorityProps) => {
  const id = useId();
  const priorityId = `${id}-priority`;
  return (
    <div>
      <label
        htmlFor={priorityId}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        優先度
      </label>
      <select
        id={priorityId}
        value={value}
        onChange={(e) => onChange(e.target.value as Priority | "")}
        disabled={disabled}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
        data-testid="task-form-priority"
      >
        <option value="">なし</option>
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
};
