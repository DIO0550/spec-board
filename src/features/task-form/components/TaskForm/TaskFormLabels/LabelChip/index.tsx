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
}: LabelChipProps) => {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
      {label}
      <button
        type="button"
        aria-label={`ラベル「${label}」を削除`}
        className="ml-0.5 rounded text-gray-400 hover:text-gray-700"
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
};
