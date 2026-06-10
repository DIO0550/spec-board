import { useId } from "react";

type TaskFormDueProps = {
  /** 現在値（`YYYY-MM-DD` または空文字 = 未設定） */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string) => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * 期限入力フィールド（ネイティブ date 入力）。
 * 値の検証は持たず、submit 時の `DueField.toParam` に委ねるステートレスな子。
 * @param props - {@link TaskFormDueProps}
 * @returns 期限入力 UI
 */
export const TaskFormDue = ({
  value,
  onChange,
  disabled,
}: TaskFormDueProps) => {
  const id = useId();
  const dueId = `${id}-due`;
  return (
    <div>
      <label
        htmlFor={dueId}
        className="mb-1 block text-xs font-medium text-foreground"
      >
        期限
      </label>
      <input
        id={dueId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-border px-2 py-1 text-sm outline-none focus:border-accent disabled:bg-surface-muted"
        data-testid="task-form-due"
      />
    </div>
  );
};
