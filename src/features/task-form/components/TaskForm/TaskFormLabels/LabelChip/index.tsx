type LabelChipProps = {
  /** 表示するラベル文字列 */
  label: string;
  /**
   * × ボタン押下時のコールバック。
   * 親で対象ラベルを束縛して渡す想定（呼び出し側で `() => remove(label)` とする）。
   */
  onRemove: () => void;
  /** 無効化（× ボタンが disabled になる） */
  disabled?: boolean;
  /**
   * 削除ボタンの aria-label を上書きする。
   * 未指定時は「ラベル「{label}」を削除」（既存挙動）。
   */
  removeAriaLabel?: string;
  /**
   * chip 本体の hover ツールチップ（`title` 属性）。
   * 未指定時は付与しない。同名タスク判別で filePath を表示する用途。
   */
  title?: string;
};

/**
 * 1 ラベル分の chip 表示＋削除ボタン。
 * @param props - {@link LabelChipProps}
 * @returns chip 要素
 */
export const LabelChip = ({
  label,
  onRemove,
  disabled = false,
  removeAriaLabel,
  title,
}: LabelChipProps) => {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground"
    >
      {label}
      <button
        type="button"
        aria-label={removeAriaLabel ?? `ラベル「${label}」を削除`}
        className="ml-0.5 rounded text-muted hover:text-foreground"
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
};
