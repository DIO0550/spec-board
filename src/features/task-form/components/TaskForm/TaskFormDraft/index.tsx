import { useId } from "react";

type TaskFormDraftProps = {
  /** 現在値（true = 下書きとして保存） */
  checked: boolean;
  /**
   * 変更コールバック。
   * @param checked - 新しい値
   */
  onChange: (checked: boolean) => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * 「下書きとして保存」チェックボックス。
 * ON のとき frontmatter に `draft: true` を出力する。
 * @param props - {@link TaskFormDraftProps}
 * @returns 下書きチェックボックス UI
 */
export const TaskFormDraft = ({
  checked,
  onChange,
  disabled,
}: TaskFormDraftProps) => {
  const id = useId();
  const draftId = `${id}-draft`;
  return (
    <div className="flex items-center gap-2">
      <input
        id={draftId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-border accent-accent"
        data-testid="task-form-draft"
      />
      <label htmlFor={draftId} className="text-xs font-medium text-foreground">
        下書きとして保存
      </label>
    </div>
  );
};
