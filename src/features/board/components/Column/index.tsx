import {
  type DragEvent,
  Fragment,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { hasAnyBrokenLink } from "@/domains/broken-link";
import { hasParseError } from "@/domains/parse-error";
import type { Task } from "@/types/task";
import { COLUMN_DRAG_MIME_TYPE, DRAG_MIME_TYPE } from "../Board/mime";
import { useBoardCard } from "../BoardCardProvider";
import { useBoardColumn } from "../BoardColumnProvider";
import { ColumnContextMenu } from "../ColumnContextMenu";
import { ColumnHeader } from "../ColumnHeader";
import { TaskCard } from "../TaskCard";
import { computeHoverIndex } from "./dragHover";

/** 個別カラムの Props */
type ColumnProps = {
  /** ステータス名 */
  name: string;
  /** ヘッダー上端アクセント帯の色（`#rrggbb`）。未指定・不正時はフォールバックパレット。 */
  color?: string;
  /**
   * カラムの表示順インデックス（color 未指定時のフォールバック色決定に使う）。
   * フォールバック色決定に必須のため、呼び出し側（Board）は表示順インデックスを渡す。
   */
  order: number;
  /** 「+ 追加」ボタンクリック時のコールバック */
  onAddClick: () => void;
  /**
   * タスクカードクリック時のコールバック
   * @param taskId - クリックされたタスクのID
   */
  onTaskClick?: (taskId: string) => void;
  /**
   * カラム名リネーム確定時のコールバック。
   * 未指定の場合はヘッダー名編集 UI を無効化する。
   * @param newName - 新しいカラム名（trim 済み、既存と非重複）
   */
  onRename?: (newName: string) => void;
  /**
   * カラム削除確定時のコールバック。
   * 未指定の場合は削除 UI を無効化する。
   * Promise を返した場合は await し、reject した場合は ConfirmDialog を維持する。
   * @param destColumn - タスクの移動先カラム名。タスクが 0 件の場合は undefined
   */
  onDelete?: (destColumn: string | undefined) => void | Promise<void>;
  /** 自カラムヘッダーを DnD ハンドルにするか。1 カラム時は false で渡す。 */
  columnDraggable?: boolean;
};

/**
 * ステータス別の個別カラムを表示する
 * @param props - {@link ColumnProps}
 * @returns カラム要素
 */
export const Column = ({
  name,
  color,
  order,
  onAddClick,
  onTaskClick,
  onRename,
  onDelete,
  columnDraggable = false,
}: ColumnProps) => {
  const card = useBoardCard();
  const col = useBoardColumn();

  const tasks = card.tasksInColumn(name);
  const otherColumnNames = col.existingNamesExcluding(name);
  const deletionCount = col.taskCountInColumn(name);
  const dndDisabled = card.dndDisabled;

  const listRef = useRef<HTMLUListElement>(null);
  // dragover は高頻度発火するため、rAF 同フレーム内では rect 再計算を 1 回に
  // 抑制する。pendingFrameRef が null でない間は新規 rAF を予約せず、最後の
  // clientY を上書きするだけ。
  const pendingFrameRef = useRef<number | null>(null);
  const pendingClientYRef = useRef(0);

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    // dndDisabled 中は DnD UI を無効化する意図なので、独自 MIME であっても
    // hover state を更新しない。ただし「独自 MIME を持つ drop はアプリ側で
    // ハンドルする意図」なので、ブラウザ既定動作（ナビゲーション等）を抑止する
    // ため preventDefault だけは独自 MIME のときに実行する。
    const isColumnMime = e.dataTransfer.types.includes(COLUMN_DRAG_MIME_TYPE);
    const isTaskMime = e.dataTransfer.types.includes(DRAG_MIME_TYPE);
    if (dndDisabled) {
      if (isColumnMime || isTaskMime) {
        e.preventDefault();
      }
      return;
    }
    if (isColumnMime) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      return;
    }
    if (!isTaskMime) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    pendingClientYRef.current = e.clientY;
    if (pendingFrameRef.current !== null) {
      return;
    }
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      const liElements = Array.from(
        listRef.current?.querySelectorAll<HTMLLIElement>(
          "li[data-task-card]",
        ) ?? [],
      );
      const rects = liElements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      const index = computeHoverIndex(rects, pendingClientYRef.current);
      card.hover(name, index);
    });
  };

  const cancelPendingHover = () => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
  };

  // unmount 時に pending rAF を解放（メモリリーク / mount 解除後の dispatch 防止）
  useEffect(() => {
    return () => {
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    };
  }, []);

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) {
      return;
    }
    cancelPendingHover();
    card.hover(null, null);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    const isColumnMime = e.dataTransfer.types.includes(COLUMN_DRAG_MIME_TYPE);
    const isTaskMime = e.dataTransfer.types.includes(DRAG_MIME_TYPE);
    // dndDisabled 中は drop を no-op にする（drag 開始後に dndDisabled が true に
    // 切り替わったケースや外部から同一 MIME を注入されたケースを防ぐ）。
    // 独自 MIME の drop はアプリ側でハンドルする意図なので、ブラウザ既定動作
    // （ナビゲーション等）抑止のため preventDefault だけは実行する。
    if (dndDisabled) {
      if (isColumnMime || isTaskMime) {
        e.preventDefault();
      }
      return;
    }
    if (isColumnMime) {
      // column MIME を持つ drop はアプリ側でハンドルする意図なので、payload が
      // 空でも preventDefault してブラウザ既定動作（リンクナビゲーション等）を抑止する。
      e.preventDefault();
      const fromColumnName = e.dataTransfer.getData(COLUMN_DRAG_MIME_TYPE);
      if (fromColumnName) {
        void col.dropColumn({ fromColumnName, toColumnName: name });
      }
      return;
    }
    if (!isTaskMime) {
      return;
    }
    const taskFilePath = e.dataTransfer.getData(DRAG_MIME_TYPE);
    if (!taskFilePath || !card.isDragging(taskFilePath)) {
      return;
    }
    // card.isDragging が true なら Provider state は dragging なので dragSource は
    // 必ず存在する。万一 null だった場合は state を不正に進められないため安全に
    // 早期 return する（`?? name` で fromColumn === toColumn の誤った dispatch に
    // しないため）。
    const dragSource = card.dragSource;
    if (dragSource === null) {
      return;
    }
    e.preventDefault();
    cancelPendingHover();
    // rAF throttle により hoverTarget.index は他カラムの drop で stale な可能性が
    // ある。drop event の clientY から this カラムの DOM rect を使って toIndex を
    // 同期計算する。
    const liElements = Array.from(
      listRef.current?.querySelectorAll<HTMLLIElement>("li[data-task-card]") ??
        [],
    );
    const rects = liElements.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const toIndex = computeHoverIndex(rects, e.clientY);
    void card.dropTask({
      taskFilePath,
      // ドラッグ開始時点の fromColumn を Provider state から復元する。
      // task.status 経由だと drag 中の楽観更新等で stale になり、moveTask の
      // preflight が「fromColumn !== task.status」を異常検知する経路を破る可能性がある。
      fromColumn: dragSource.fromColumn,
      toColumn: name,
      toIndex,
    });
  };

  const placeholderIndex =
    card.hoverTarget.column === name ? card.hoverTarget.index : null;

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [destColumn, setDestColumn] = useState<string>("");
  const triggerRef = useRef<HTMLElement | null>(null);

  const handleContextMenu = onDelete
    ? (e: MouseEvent<HTMLElement>) => {
        e.preventDefault();
        triggerRef.current = e.currentTarget;
        // キーボード操作（Enter/Space）で発火したときは clientX/Y が 0 になる
        // ため、トリガー要素の矩形を基準に配置して左上表示を避ける。
        if (e.clientX !== 0 || e.clientY !== 0) {
          setMenuPos({ x: e.clientX, y: e.clientY });
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuPos({ x: rect.left, y: rect.bottom });
      }
    : undefined;

  const handleMenuClose = () => {
    setMenuPos(null);
    // キーボードでメニューを開いた場合にフォーカスが失われないよう、
    // 開いた要素へフォーカスを戻す。
    triggerRef.current?.focus();
    triggerRef.current = null;
  };

  const handleDeleteClick = () => {
    setDestColumn(otherColumnNames[0] ?? "");
    setIsConfirming(true);
  };

  /**
   * 削除確認ダイアログの「削除」確定ハンドラ。
   * pending 中の二重実行は guard し、reject 時は dialog を維持する。
   */
  const handleConfirm = async () => {
    if (isDeleting) {
      return;
    }
    const hasTasksInside = deletionCount > 0;
    setIsDeleting(true);
    try {
      await onDelete?.(hasTasksInside ? destColumn : undefined);
    } catch {
      // 失敗時は ConfirmDialog を開いたままにし、ユーザの destColumn 選択も保持する
      // (caller 側で error toast 等の通知が出ている前提)
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
    setIsConfirming(false);
  };

  /**
   * 削除確認ダイアログのキャンセルハンドラ。
   * pending 中（IPC 応答待ち）はキャンセル操作も抑止する。
   */
  const handleCancel = () => {
    if (isDeleting) {
      return;
    }
    setIsConfirming(false);
  };

  const hasTasks = deletionCount > 0;
  // pending 中も confirm ボタンを disabled にして二重実行を防ぐ
  const needsDestColumn = hasTasks && destColumn === "";
  const confirmDisabled = needsDestColumn || isDeleting;
  // タスクが残っているのに移動先が無いとダイアログが「確定不能」になるため、
  // メニュー側で削除操作そのものを封じる。
  const canDeleteEffective =
    col.canDelete(name) && !(hasTasks && otherColumnNames.length === 0);

  /**
   * ColumnHeader 経由のカラム dragstart を Provider へ流す。
   * @param columnName 自カラム名
   */
  const handleColumnDragStart = (columnName: string) => {
    col.startDrag(columnName);
  };

  /** ColumnHeader 経由のカラム dragend を Provider へ流す。 */
  const handleColumnDragEnd = () => {
    col.end();
  };

  return (
    <section
      className="flex h-full w-72 min-w-72 flex-col rounded-lg bg-surface-muted"
      aria-label={name}
      data-testid={`column-${name}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ColumnHeader
        name={name}
        taskCount={tasks.length}
        color={color}
        order={order}
        onAddClick={onAddClick}
        onRename={onRename}
        existingColumnNames={[...otherColumnNames]}
        onContextMenu={handleContextMenu}
        draggable={columnDraggable && !dndDisabled}
        onColumnDragStart={handleColumnDragStart}
        onColumnDragEnd={handleColumnDragEnd}
      />
      <ul ref={listRef} className="flex-1 overflow-y-auto px-2 pb-2">
        {tasks.map((task, i) => {
          // 直下子のみのリスト。TaskCard 配下の "サブIssue" details が
          // childTasks を展開して表示するため、Provider の byPath で実体を引き当てる。
          // 解決できなかった child は broken なので結果からは除外する。
          const childTasks = task.hierarchy.childFilePaths
            .map((fp) => card.byPath(fp))
            .filter((t): t is Task => t !== undefined);
          return (
            <Fragment key={task.id}>
              {placeholderIndex === i && (
                <li
                  data-testid="drop-placeholder"
                  aria-hidden="true"
                  className="mb-2 h-1 rounded bg-blue-300"
                />
              )}
              <li data-task-card className="mb-2">
                <TaskCard
                  task={task}
                  childTasks={childTasks}
                  fromColumn={name}
                  hasBrokenLink={hasAnyBrokenLink(
                    task,
                    card.tasksByNormalizedPath,
                  )}
                  hasParseError={hasParseError(task)}
                  onClick={onTaskClick}
                />
              </li>
            </Fragment>
          );
        })}
        {placeholderIndex === tasks.length && (
          <li
            data-testid="drop-placeholder"
            aria-hidden="true"
            className="mb-2 h-1 rounded bg-blue-300"
          />
        )}
      </ul>
      {menuPos && (
        <ColumnContextMenu
          x={menuPos.x}
          y={menuPos.y}
          canDelete={canDeleteEffective}
          onDelete={handleDeleteClick}
          onClose={handleMenuClose}
        />
      )}
      {isConfirming && (
        <ConfirmDialog
          title="カラムを削除"
          message={
            hasTasks
              ? `「${name}」には ${deletionCount} 件のタスクがあります。移動先を選択してください。`
              : `「${name}」を削除します。よろしいですか？`
          }
          confirmLabel="削除"
          confirmDisabled={confirmDisabled}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        >
          {hasTasks && otherColumnNames.length > 0 && (
            <label className="mt-4 block text-sm text-foreground">
              移動先カラム
              <select
                value={destColumn}
                onChange={(e) => setDestColumn(e.target.value)}
                className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
                data-testid="column-delete-destination"
              >
                {otherColumnNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
};
