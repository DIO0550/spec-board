import { useId } from "react";
import type { TitleValidationError } from "@/features/task-form/lib/fields/title";
import { titleErrorMessage } from "./titleErrorMessage";

type TaskFormTitleProps = {
  /** 現在値 */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string) => void;
  /** 構造化エラー。undefined なら「エラーなし」。表示直前に titleErrorMessage で日本語化する。 */
  error?: TitleValidationError;
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
        className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted"
      >
        タイトル <span className="text-red-600">*</span>
      </label>
      <input
        id={titleId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="例: 検索結果ページのページネーション"
        aria-invalid={hasError}
        aria-describedby={hasError ? titleErrorId : undefined}
        className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-base font-medium text-foreground outline-none placeholder:text-text-dim focus:border-accent disabled:bg-surface-muted"
        data-testid="task-form-title"
      />
      {hasError && (
        <p
          id={titleErrorId}
          className="mt-1 text-xs text-red-600"
          data-testid="task-form-title-error"
        >
          {titleErrorMessage(error)}
        </p>
      )}
    </div>
  );
};
