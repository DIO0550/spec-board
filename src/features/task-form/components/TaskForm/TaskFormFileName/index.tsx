import { useId } from "react";
import type { FileNameValidationError } from "@/features/task-form/lib/fields/fileName";
import { fileNameErrorMessage } from "./fileNameErrorMessage";

type TaskFormFileNameProps = {
  /**
   * 現在値（ファイル名欄の入力値）。入力中は生のまま保持されるため `.md` や
   * 前後空白を含み得る。trim + 末尾 `.md` 剥がしは submit 時の
   * `FileNameField.toParam` が担う。
   */
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
 * ファイル名入力フィールド。`.md` サフィックスを固定表示し、拡張子なしの入力を促す。
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
        className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted"
      >
        ファイル名
      </label>
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-panel font-mono focus-within:border-accent">
        <input
          id={fileNameId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="new-issue"
          aria-invalid={hasError}
          aria-describedby={hasError ? fileNameErrorId : undefined}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-text-dim disabled:bg-surface-muted"
          data-testid="task-form-file-name"
        />
        <span className="shrink-0 border-l border-border bg-panel-2 px-2.5 py-2.5 text-xs text-text-dim">
          .md
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-text-dim">
        未編集の場合はタイトルから自動生成。既存と重複する場合は保存時に連番が付きます
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
