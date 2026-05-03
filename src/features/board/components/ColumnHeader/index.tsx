import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

/** カラムヘッダーの Props */
type ColumnHeaderProps = {
  /** ステータス名 */
  name: string;
  /** カラム内のタスク件数 */
  taskCount: number;
  /** 「+ 追加」ボタンクリック時のコールバック */
  onAddClick: () => void;
  /**
   * カラム名リネーム確定時のコールバック。
   * 未指定の場合は名前クリックでの編集モードを無効化する。
   * 呼び出されるのは trim 後に空でなく、現在名と異なり、重複もしない場合のみ。
   * Promise を返した場合は await し、reject した場合は edit mode を維持する。
   * @param newName - 新しいカラム名（trim 済み）
   */
  onRename?: (newName: string) => void | Promise<void>;
  /** 他カラム名の一覧（重複チェック用。自身は含まない） */
  existingColumnNames?: string[];
  /**
   * ヘッダーのメニュー要求（右クリック、またはメニューボタン押下）時のコールバック。
   * 未指定の場合はメニューボタンも非表示になり、ブラウザ既定動作のまま。
   * @param event - 発生した MouseEvent
   */
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
};

/**
 * カラムヘッダーを表示する。
 * onRename 指定時はステータス名クリックでインライン編集に切り替わる。
 * @param props - {@link ColumnHeaderProps}
 * @returns カラムヘッダー要素
 */
export const ColumnHeader = ({
  name,
  taskCount,
  onAddClick,
  onRename,
  existingColumnNames = [],
  onContextMenu,
}: ColumnHeaderProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(name);
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);
  const reactId = useId();
  const errorId = `${reactId}-error`;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    if (!onRename) {
      return;
    }
    isCancelledRef.current = false;
    setInputValue(name);
    setIsEditing(true);
  };

  const cancel = () => {
    isCancelledRef.current = true;
    setInputValue(name);
    setIsEditing(false);
  };

  const confirm = async (): Promise<boolean> => {
    // re-entrant guard: pending 中の連打 (Enter 連打) を抑止
    if (isBusy) {
      return false;
    }
    const trimmed = inputValue.trim();
    if (trimmed.length === 0 || trimmed === name) {
      isCancelledRef.current = true;
      setInputValue(name);
      setIsEditing(false);
      return true;
    }
    if (existingColumnNames.includes(trimmed)) {
      return false;
    }
    setIsBusy(true);
    try {
      await onRename?.(trimmed);
    } catch {
      // 失敗時は edit mode を維持し、ユーザの入力を保持する
      // (caller 側で error toast 等の通知が出ている前提)
      setIsBusy(false);
      return false;
    }
    setIsBusy(false);
    isCancelledRef.current = true;
    setIsEditing(false);
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      void confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const trimmedInput = inputValue.trim();
  const isDuplicate =
    trimmedInput.length > 0 &&
    trimmedInput !== name &&
    existingColumnNames.includes(trimmedInput);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: onContextMenu is a secondary trigger for mouse users; the inner menu button provides the keyboard-accessible path
    <div
      className="flex items-center justify-between px-2 py-2"
      onContextMenu={onContextMenu}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!isCancelledRef.current) {
                  cancel();
                }
                isCancelledRef.current = false;
              }}
              disabled={isBusy}
              aria-label="カラム名"
              aria-invalid={isDuplicate}
              aria-describedby={isDuplicate ? errorId : undefined}
              className="w-full min-w-32 rounded border border-blue-400 px-1 py-0.5 text-sm font-semibold text-gray-900 outline-none disabled:bg-gray-100"
              data-testid="column-rename-input"
            />
            {isDuplicate && (
              <p id={errorId} className="text-xs text-red-500" role="alert">
                同じ名前のカラムが既に存在します
              </p>
            )}
          </div>
        ) : onRename ? (
          <h2 className="text-sm font-semibold text-gray-700">
            <button
              type="button"
              onClick={startEditing}
              aria-label={`${name}の名前を変更`}
              className="rounded px-1 py-0.5 hover:bg-gray-100"
              data-testid="column-name-button"
            >
              {name}
            </button>
          </h2>
        ) : (
          <h2 className="text-sm font-semibold text-gray-700">{name}</h2>
        )}
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
          {taskCount}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {onContextMenu && (
          <button
            type="button"
            onClick={onContextMenu}
            aria-label={`${name}のメニューを開く`}
            aria-haspopup="menu"
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            data-testid="column-menu-button"
          >
            ⋯
          </button>
        )}
        <button
          type="button"
          onClick={onAddClick}
          aria-label={`${name}に追加`}
          className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          + 追加
        </button>
      </div>
    </div>
  );
};
