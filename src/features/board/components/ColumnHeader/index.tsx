import type { DragEvent, MouseEvent } from "react";
import { useRef } from "react";
import { ColumnColor } from "@/domains/column-color";
import { useInlineColumnNameInput } from "@/features/board/hooks/useInlineColumnNameInput";
import { COLUMN_DRAG_MIME_TYPE } from "../Board/mime";
import { ColumnNameInput } from "../ColumnNameInput";

/** @returns カラムヘッダーの追加プラスアイコン */
const PlusIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="size-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** カラムヘッダーの Props */
type ColumnHeaderProps = {
  /** ステータス名 */
  name: string;
  /** カラム内のタスク件数 */
  taskCount: number;
  /**
   * フィルタ非適用のカラム内総タスク件数（WIP 超過判定用）。
   * 未指定時は taskCount で判定する。バッジの表示件数は常に taskCount。
   */
  totalTaskCount?: number;
  /** カラムの WIP 上限（1 以上）。未指定なら上限表示・超過判定を行わない。 */
  wipLimit?: number;
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
  totalTaskCount,
  wipLimit,
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
  // カラム dragend 直後の synthetic click を抑止するためのガード。
  // dragstart で true にし、root の onClick / 名前クリックの編集開始はこのフラグ中は無視する。
  // click は dragend より後に届くため、handleDragEnd では即解除せず setTimeout で遅延解除する。
  const dragGuardRef = useRef(false);

  const field = useInlineColumnNameInput({
    initialValue: name,
    currentName: name,
    existingNames: existingColumnNames,
    selectOnFocus: true,
    onCommit: (trimmed) => onRename?.(trimmed),
  });

  // dragGuard を噛ませた編集開始（dragend 直後の synthetic click では編集に入らない）。
  const handleNameClick = () => {
    if (dragGuardRef.current) {
      dragGuardRef.current = false;
      return;
    }
    field.startEditing();
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
    // dragend 直後の synthetic click はこのマクロタスクの後に届く。0ms 遅延で解除を
    // 次のマクロタスクに回し、その click をガードしてから false に戻す。
    setTimeout(() => {
      dragGuardRef.current = false;
    }, 0);
  };

  const handleRootClick = () => {
    if (dragGuardRef.current) {
      dragGuardRef.current = false;
    }
  };

  const accentColor = ColumnColor.resolveAccent(color, order);
  // 超過判定はフィルタ非適用の総件数で行う。表示中の絞り込み件数で判定すると、
  // フィルタを掛けただけで警告が消えて WIP 制限の意味がなくなる。
  const wipCount = totalTaskCount ?? taskCount;
  const wipExceeded = wipLimit !== undefined && wipCount > wipLimit;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: onContextMenu / draggable are secondary triggers for mouse users; rename / menu buttons inside provide the keyboard-accessible path
    // biome-ignore lint/a11y/useKeyWithClickEvents: root onClick only consumes dragGuardRef after dragend; rename / menu buttons inside provide the keyboard-accessible path
    <div
      className="relative flex min-h-11 items-center justify-between border-b border-border px-3 py-2.5 pl-3.5"
      style={{ borderTopColor: accentColor }}
      data-testid="column-header"
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragEnd={draggable ? handleDragEnd : undefined}
      onClick={draggable ? handleRootClick : undefined}
      onContextMenu={onContextMenu}
    >
      <span
        aria-hidden="true"
        data-testid="column-accent"
        className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-sm"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {field.isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <ColumnNameInput
              field={field}
              className="w-full min-w-32 rounded border border-accent bg-surface px-1.5 py-1 text-[12.5px] font-semibold text-foreground outline-none ring-accent-soft focus:ring-[3px] disabled:bg-surface-muted"
              dataTestId="column-rename-input"
              dndDisabled
            />
          </div>
        ) : onRename ? (
          <h2 className="min-w-0 text-[12.5px] font-semibold leading-5 text-foreground">
            <button
              type="button"
              onClick={handleNameClick}
              aria-label={`${name}の名前を変更`}
              className="max-w-full truncate rounded px-1 py-0.5 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
              data-column-dnd-disabled
              data-testid="column-name-button"
            >
              {name}
            </button>
          </h2>
        ) : (
          <h2 className="min-w-0 text-[12.5px] font-semibold leading-5 text-foreground">
            {name}
          </h2>
        )}
        <span
          data-testid="column-task-count"
          data-wip-exceeded={wipExceeded ? "true" : undefined}
          title={
            wipExceeded
              ? `WIP上限超過（全${wipCount}件 / 上限${wipLimit}件）`
              : undefined
          }
          className={
            wipExceeded
              ? "rounded-full border border-danger bg-danger-soft px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-danger"
              : "rounded-full border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-muted"
          }
        >
          {wipLimit === undefined ? taskCount : `${taskCount}/${wipLimit}`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {onContextMenu && (
          <button
            type="button"
            onClick={onContextMenu}
            aria-label={`${name}のメニューを開く`}
            aria-haspopup="menu"
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded px-1 text-[10.5px] font-medium leading-none text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
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
          className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded px-1 text-[10.5px] font-medium leading-none text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          data-column-dnd-disabled
        >
          <PlusIcon />
          <span className="sr-only">+ 追加</span>
        </button>
      </div>
    </div>
  );
};
