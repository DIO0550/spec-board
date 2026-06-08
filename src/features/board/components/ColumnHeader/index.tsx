import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { ColumnColor } from "@/domains/column-color";
import { COLUMN_DRAG_MIME_TYPE } from "../Board/columnDragState";

/** カラムヘッダーの Props */
type ColumnHeaderProps = {
  /** ステータス名 */
  name: string;
  /** カラム内のタスク件数 */
  taskCount: number;
  /** ヘッダー上端アクセント帯の色（`#rrggbb`）。未指定・不正時はフォールバックパレット。 */
  color?: string;
  /**
   * カラムの表示順インデックス（color 未指定時のフォールバック色決定に使う）。
   * フォールバック色決定に必須のため、呼び出し側は必ず表示順インデックスを渡す。
   */
  order: number;
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
  /**
   * カラム DnD ハンドルとして最外殻 div を draggable にするか。
   * false / 未指定なら DnD は無効（既存挙動）。
   */
  draggable?: boolean;
  /**
   * カラム DnD の dragstart 通知。最外殻 dragstart 発火直後、
   * `setData(COLUMN_DRAG_MIME_TYPE, name)` の後に呼ばれる。
   * 子 `data-column-dnd-disabled` 要素発火の dragstart は preventDefault されて呼ばれない。
   * @param columnName 自カラム名
   */
  onColumnDragStart?: (columnName: string) => void;
  /** カラム DnD の dragend 通知。dragstart が中止された場合は呼ばれない。 */
  onColumnDragEnd?: () => void;
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
  color,
  order,
  onAddClick,
  onRename,
  existingColumnNames = [],
  onContextMenu,
  draggable = false,
  onColumnDragStart,
  onColumnDragEnd,
}: ColumnHeaderProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(name);
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);
  const dragGuardRef = useRef(false);
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
    if (dragGuardRef.current) {
      dragGuardRef.current = false;
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

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    const target = e.target as Element | null;
    if (target?.closest?.("[data-column-dnd-disabled]")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, name);
    e.dataTransfer.effectAllowed = "move";
    dragGuardRef.current = true;
    onColumnDragStart?.(name);
  };

  const handleDragEnd = () => {
    onColumnDragEnd?.();
    setTimeout(() => {
      dragGuardRef.current = false;
    }, 0);
  };

  const handleRootClick = () => {
    if (dragGuardRef.current) {
      dragGuardRef.current = false;
    }
  };

  const trimmedInput = inputValue.trim();
  const isDuplicate =
    trimmedInput.length > 0 &&
    trimmedInput !== name &&
    existingColumnNames.includes(trimmedInput);

  const accentColor = ColumnColor.resolveAccent(color, order);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: onContextMenu / draggable are secondary triggers for mouse users; rename / menu buttons inside provide the keyboard-accessible path
    // biome-ignore lint/a11y/useKeyWithClickEvents: root onClick only consumes dragGuardRef after dragend; rename / menu buttons inside provide the keyboard-accessible path
    <div
      className="flex items-center justify-between border-t-2 px-2 py-2"
      style={{ borderTopColor: accentColor }}
      data-testid="column-header"
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragEnd={draggable ? handleDragEnd : undefined}
      onClick={draggable ? handleRootClick : undefined}
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
                // isBusy 中は input が disabled 化により blur が発火するが、
                // pending 中の cancel は edit mode を閉じてユーザの入力を失わせる
                // ため無視する
                if (isBusy) {
                  return;
                }
                if (!isCancelledRef.current) {
                  cancel();
                }
                isCancelledRef.current = false;
              }}
              disabled={isBusy}
              aria-label="カラム名"
              aria-invalid={isDuplicate}
              aria-describedby={isDuplicate ? errorId : undefined}
              className="w-full min-w-32 rounded border border-accent px-1 py-0.5 text-sm font-semibold text-foreground outline-none disabled:bg-surface-muted"
              data-column-dnd-disabled
              data-testid="column-rename-input"
            />
            {isDuplicate && (
              <p id={errorId} className="text-xs text-red-500" role="alert">
                同じ名前のカラムが既に存在します
              </p>
            )}
          </div>
        ) : onRename ? (
          <h2 className="text-sm font-semibold text-foreground">
            <button
              type="button"
              onClick={startEditing}
              aria-label={`${name}の名前を変更`}
              className="rounded px-1 py-0.5 hover:bg-surface-muted"
              data-column-dnd-disabled
              data-testid="column-name-button"
            >
              {name}
            </button>
          </h2>
        ) : (
          <h2 className="text-sm font-semibold text-foreground">{name}</h2>
        )}
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
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
            className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-muted hover:text-foreground"
            data-column-dnd-disabled
            data-testid="column-menu-button"
          >
            ⋯
          </button>
        )}
        <button
          type="button"
          onClick={onAddClick}
          aria-label={`${name}に追加`}
          className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-muted hover:text-foreground"
          data-column-dnd-disabled
        >
          + 追加
        </button>
      </div>
    </div>
  );
};
