import { useId } from "react";
import type { SubIssuesValidationError } from "@/features/task-form/lib/fields/subIssues";
import { subIssuesErrorMessage } from "./subIssuesErrorMessage";

type TaskFormSubIssuesProps = {
  /** 現在値（複数行の raw テキスト） */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string) => void;
  /** 行番号付き検証エラー。undefined なら「エラーなし」。表示直前に subIssuesErrorMessage で日本語化する。 */
  error?: SubIssuesValidationError;
  /** 無効化 */
  disabled: boolean;
};

/**
 * サブIssue 入力フィールド（複数行 textarea）。1 行 = 1 サブIssue。
 * バリデーション判断は持たず、渡された error prop を表示するだけのステートレスな子。
 * @param props - {@link TaskFormSubIssuesProps}
 * @returns サブIssue 入力 UI
 */
export const TaskFormSubIssues = ({
  value,
  onChange,
  error,
  disabled,
}: TaskFormSubIssuesProps) => {
  const id = useId();
  const subIssuesId = `${id}-sub-issues`;
  const subIssuesErrorId = `${id}-sub-issues-error`;
  const hasError = error !== undefined;
  return (
    <div>
      <label
        htmlFor={subIssuesId}
        className="mb-1 block text-xs font-medium text-foreground"
      >
        サブIssue
      </label>
      <textarea
        id={subIssuesId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        aria-invalid={hasError}
        aria-describedby={hasError ? subIssuesErrorId : undefined}
        className="w-full rounded border border-border px-2 py-1 text-sm outline-none focus:border-accent disabled:bg-surface-muted"
        data-testid="task-form-sub-issues"
      />
      <p className="mt-1 text-xs text-muted">
        1 行につき 1 件のサブIssue を作成します（空行は無視）
      </p>
      {hasError && (
        <p
          id={subIssuesErrorId}
          className="mt-1 text-xs text-red-600"
          data-testid="task-form-sub-issues-error"
        >
          {subIssuesErrorMessage(error)}
        </p>
      )}
    </div>
  );
};
