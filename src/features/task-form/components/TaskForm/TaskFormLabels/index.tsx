import type { KeyboardEvent } from "react";
import { useId } from "react";

type TaskFormLabelsProps = {
  /** 確定済みラベル一覧 */
  labels: string[];
  /** 未コミット入力文字列 */
  labelInput: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい入力値
   */
  setInput: (value: string) => void;
  /** blur 時にコミットする関数 */
  commit: () => void;
  /**
   * ラベル削除時のコールバック。
   * @param label - 削除対象ラベル
   */
  remove: (label: string) => void;
  /**
   * input の onKeyDown に渡すハンドラ（Enter で commit）。
   * @param e - キーボードイベント
   */
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * ラベル入力フィールド。
 * chip 表示 + input、Enter または blur でコミット、× で削除する pure な子コンポーネント。
 * 状態は useLabelsInput フックで管理され、props 経由でのみ受け取る。
 * @param props - {@link TaskFormLabelsProps}
 * @returns ラベル入力 UI
 */
export const TaskFormLabels = ({
  labels,
  labelInput,
  setInput,
  commit,
  remove,
  handleKeyDown,
  disabled,
}: TaskFormLabelsProps) => {
  const id = useId();
  const labelsId = `${id}-labels`;
  return (
    <div>
      <label
        htmlFor={labelsId}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        ラベル
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
          >
            {label}
            <button
              type="button"
              aria-label={`ラベル「${label}」を削除`}
              className="ml-0.5 rounded text-gray-400 hover:text-gray-700"
              disabled={disabled}
              onClick={() => remove(label)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={labelsId}
          type="text"
          value={labelInput}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          disabled={disabled}
          placeholder="Enter で追加"
          className="flex-1 min-w-[100px] rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
          data-testid="task-form-label-input"
        />
      </div>
    </div>
  );
};
