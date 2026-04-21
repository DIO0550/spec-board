import { useId } from "react";

type TaskFormBodyProps = {
  /** 現在値 */
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
 * タスク本文（Markdown）入力フィールド。
 * @param props - {@link TaskFormBodyProps}
 * @returns 本文入力 UI
 */
export const TaskFormBody = ({
  value,
  onChange,
  disabled,
}: TaskFormBodyProps) => {
  const id = useId();
  const bodyId = `${id}-body`;
  return (
    <div>
      <label
        htmlFor={bodyId}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        説明
      </label>
      <textarea
        id={bodyId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
        data-testid="task-form-body"
      />
    </div>
  );
};
