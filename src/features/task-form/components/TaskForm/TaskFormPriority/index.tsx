import { Priority } from "@/domains/priority";
import { ChipRadioGroup } from "../ChipRadioGroup";

// board の PriorityBadge と同じ配色。変更時は両者を揃えること。
const PRIORITY_CHIP_CLASSES: Record<Priority, string> = {
  High: "bg-red-100 text-red-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};

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
 * なし + Priority.OPTIONS の 4 チップを提供する pure な子コンポーネント。
 * @param props - {@link TaskFormPriorityProps}
 * @returns 優先度選択 UI
 */
export const TaskFormPriority = ({
  value,
  onChange,
  disabled,
}: TaskFormPriorityProps) => {
  return (
    <ChipRadioGroup
      label="優先度"
      options={[
        { value: "", label: "なし" },
        ...Priority.OPTIONS.map((p) => ({
          value: p,
          label: p,
          className: PRIORITY_CHIP_CLASSES[p],
        })),
      ]}
      value={value}
      onChange={(v) => onChange(v as Priority | "")}
      disabled={disabled}
      data-testid="task-form-priority"
    />
  );
};
