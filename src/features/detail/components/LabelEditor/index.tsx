import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

/** LabelEditor の Props */
type LabelEditorProps = {
  /** 現在のラベル一覧 */
  labels: string[];
  /**
   * ラベル追加時のコールバック
   * @param label - 追加するラベル名
   */
  onAdd: (label: string) => void;
  /**
   * ラベル削除時のコールバック
   * @param label - 削除するラベル名
   */
  onRemove: (label: string) => void;
};

/**
 * ラベルの表示・追加・削除を行うエディタコンポーネント
 * @param props - {@link LabelEditorProps}
 * @returns ラベルエディタ要素
 */
export const LabelEditor = ({ labels, onAdd, onRemove }: LabelEditorProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);

  /** 入力値を確定してラベルを追加する */
  const confirmAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed.length > 0 && !labels.includes(trimmed)) {
      onAdd(trimmed);
    }
    setInputValue("");
    setIsAdding(false);
  };

  /** 追加をキャンセルして入力フィールドを閉じる */
  const cancelAdd = () => {
    isCancelledRef.current = true;
    setInputValue("");
    setIsAdding(false);
  };

  /** キーボードイベントを処理する（Enter: 確定、Escape: キャンセル） */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      isCancelledRef.current = true;
      confirmAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelAdd();
    }
  };

  const handleAddClick = () => {
    setIsAdding(true);
  };

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  return (
    <div data-testid="label-editor">
      <div className="mb-1 text-xs font-medium text-gray-500">ラベル</div>
      <div className="flex flex-wrap gap-1.5">
        {[...new Set(labels)].map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
          >
            {label}
            <button
              type="button"
              aria-label={`ラベル「${label}」を削除`}
              className="ml-0.5 rounded text-gray-400 hover:text-gray-700"
              onClick={() => onRemove(label)}
            >
              ×
            </button>
          </span>
        ))}
        {isAdding ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!isCancelledRef.current) confirmAdd();
              isCancelledRef.current = false;
            }}
            className="rounded border border-blue-400 px-1.5 py-0.5 text-xs outline-none"
            data-testid="label-input"
            placeholder="ラベル名"
          />
        ) : (
          <button
            type="button"
            className="rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
            data-testid="label-add-button"
            onClick={handleAddClick}
          >
            + 追加
          </button>
        )}
      </div>
    </div>
  );
};
