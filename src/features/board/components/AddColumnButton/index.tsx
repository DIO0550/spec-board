import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

/** AddColumnButton の Props */
type AddColumnButtonProps = {
  /** 既存のカラム名一覧（重複チェック用） */
  existingColumnNames: string[];
  /**
   * 新規カラム追加時のコールバック。
   * 入力値の trim 後に空文字や既存と同名の場合は呼び出されない。
   * @param columnName - 追加するカラム名（trim 済み）
   */
  onAdd: (columnName: string) => void;
};

/**
 * ボード右端に表示される「+ カラムを追加」ボタン。
 * クリックでカラム名入力フィールドに切り替わり、
 * Enter で確定（onAdd 呼び出し）、Esc でキャンセルする。
 *
 * @param props - {@link AddColumnButtonProps}
 * @returns カラム追加ボタン要素
 */
export const AddColumnButton = ({
  existingColumnNames,
  onAdd,
}: AddColumnButtonProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);
  const id = useId();
  const errorId = `${id}-error`;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const startEditing = () => {
    isCancelledRef.current = false;
    setInputValue("");
    setIsEditing(true);
  };

  const cancel = () => {
    isCancelledRef.current = true;
    setInputValue("");
    setIsEditing(false);
  };

  const confirm = (): boolean => {
    const trimmed = inputValue.trim();
    if (trimmed.length === 0) {
      isCancelledRef.current = true;
      setInputValue("");
      setIsEditing(false);
      return true;
    }
    if (existingColumnNames.includes(trimmed)) {
      return false;
    }
    onAdd(trimmed);
    isCancelledRef.current = true;
    setInputValue("");
    setIsEditing(false);
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const trimmedInput = inputValue.trim();
  const isDuplicate =
    trimmedInput.length > 0 && existingColumnNames.includes(trimmedInput);

  if (isEditing) {
    return (
      <div className="flex h-fit w-72 min-w-72 flex-col gap-1 rounded-lg bg-gray-50 p-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!isCancelledRef.current) cancel();
            isCancelledRef.current = false;
          }}
          placeholder="カラム名"
          aria-label="カラム名"
          aria-invalid={isDuplicate}
          aria-describedby={isDuplicate ? errorId : undefined}
          className="w-full rounded border border-blue-400 px-2 py-1 text-sm text-gray-900 outline-none"
          data-testid="add-column-input"
        />
        {isDuplicate && (
          <p id={errorId} className="text-xs text-red-500" role="alert">
            同じ名前のカラムが既に存在します
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      aria-label="カラムを追加"
      className="h-fit w-72 min-w-72 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
      data-testid="add-column-button"
    >
      + カラムを追加
    </button>
  );
};
