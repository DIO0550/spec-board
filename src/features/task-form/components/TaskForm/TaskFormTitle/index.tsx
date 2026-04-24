import { useId } from "react";

type TaskFormTitleProps = {
  /** 現在値 */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string) => void;
  /** エラーメッセージ。undefined なら「エラーなし」 */
  error?: string;
  /** 無効化 */
  disabled: boolean;
};

/**
 * タスクタイトル入力フィールド。
 * バリデーション判断は持たず、渡された error prop を表示するだけのステートレスな子。
 * @param props - {@link TaskFormTitleProps}
 * @returns タイトル入力 UI
 */
export const TaskFormTitle = ({
  value,
  onChange,
  error,
  disabled,
}: TaskFormTitleProps) => {
  const id = useId();
  const titleId = `${id}-title`;
  const titleErrorId = `${id}-title-error`;
  const hasError = error !== undefined;
  return (
    <div>
      <label
        htmlFor={titleId}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        タイトル <span className="text-red-600">*</span>
      </label>
      <input
        id={titleId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={hasError ? titleErrorId : undefined}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
        data-testid="task-form-title"
      />
      {hasError && (
        <p
          id={titleErrorId}
          className="mt-1 text-xs text-red-600"
          data-testid="task-form-title-error"
        >
          {error}
        </p>
      )}
    </div>
  );
};
