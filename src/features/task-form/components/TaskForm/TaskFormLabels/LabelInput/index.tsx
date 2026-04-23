import type { KeyboardEvent } from "react";

type LabelInputProps = {
  /** input の id（TaskFormLabels の `<label htmlFor>` と合わせる） */
  id: string;
  /** 入力欄の現在値（未コミット文字列） */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい入力値
   */
  onChange: (value: string) => void;
  /**
   * onKeyDown ハンドラ（Enter で commit 等）。
   * @param e - キーボードイベント
   */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** blur 時のコミットコールバック */
  onBlur: () => void;
  /** 無効化 */
  disabled?: boolean;
};

/**
 * ラベル入力欄。
 * @param props - {@link LabelInputProps}
 * @returns input 要素
 */
export const LabelInput = ({
  id,
  value,
  onChange,
  onKeyDown,
  onBlur,
  disabled = false,
}: LabelInputProps) => {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      disabled={disabled}
      placeholder="Enter で追加"
      className="flex-1 min-w-[100px] rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
      data-testid="task-form-label-input"
    />
  );
};
