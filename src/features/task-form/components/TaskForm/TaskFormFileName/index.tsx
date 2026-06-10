import { useId } from "react";
import type { FileNameValidationError } from "@/features/task-form/lib/fields/fileName";
import { fileNameErrorMessage } from "./fileNameErrorMessage";

type TaskFormFileNameProps = {
  /** 現在値（拡張子 .md を除いた base 文字列） */
  value: string;
  /**
   * 入力変更時のコールバック（手動編集 = タイトル追従停止のトリガ）。
   * @param value - 新しい生入力値
   */
  onChange: (value: string) => void;
  /** 構造化エラー。undefined なら「エラーなし」。表示直前に fileNameErrorMessage で日本語化する。 */
  error?: FileNameValidationError;
  /** 無効化 */
  disabled: boolean;
};

/**
 * ファイル名入力フィールド。`.md` サフィックスを固定表示し、base のみ編集させる。
 * バリデーション判断は持たず、渡された error prop を表示するだけのステートレスな子。
 * @param props - {@link TaskFormFileNameProps}
 * @returns ファイル名入力 UI
 */
export const TaskFormFileName = ({
  value,
  onChange,
  error,
  disabled,
}: TaskFormFileNameProps) => {
  const id = useId();
  const fileNameId = `${id}-file-name`;
  const fileNameErrorId = `${id}-file-name-error`;
  const hasError = error !== undefined;
  return (
    <div>
      <label
        htmlFor={fileNameId}
        className="mb-1 block text-xs font-medium text-foreground"
      >
        ファイル名
      </label>
      <div className="flex items-center gap-1">
        <input
          id={fileNameId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? fileNameErrorId : undefined}
          className="w-full rounded border border-border px-2 py-1 text-sm outline-none focus:border-accent disabled:bg-surface-muted"
          data-testid="task-form-file-name"
        />
        <span className="shrink-0 text-sm text-muted">.md</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        空欄でタイトルから自動生成。既存と重複する場合は保存時に連番が付きます
      </p>
      {hasError && (
        <p
          id={fileNameErrorId}
          className="mt-1 text-xs text-red-600"
          data-testid="task-form-file-name-error"
        >
          {fileNameErrorMessage(error)}
        </p>
      )}
    </div>
  );
};
