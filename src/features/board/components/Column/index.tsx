import {
  type DragEvent,
  Fragment,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Task } from "@/types/task";
import { DRAG_MIME_TYPE, type DragState } from "../Board/dragState";
import { ColumnContextMenu } from "../ColumnContextMenu";
import { ColumnHeader } from "../ColumnHeader";
import { TaskCard } from "../TaskCard";
import { computeHoverIndex } from "./dragHover";

/** Drop 確定時に呼ばれる引数。 */
export type ColumnTaskDropParams = {
  readonly taskFilePath: string;
  readonly fromColumn: string;
  readonly toColumn: string;
  readonly toIndex: number;
};

/** 個別カラムの Props */
type ColumnProps = {
  /** ステータス名 */
  name: string;
  /** カラムに属するタスクの配列 */
  tasks: Task[];
  /** 全タスクの配列（子タスク解決用） */
  allTasks?: Task[];
  /** 完了カラム名 */
  doneColumn?: string;
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
  /** 他カラム名の一覧（重複チェック用。自身は含まない） */
  existingColumnNames?: string[];
  /**
   * カラム削除確定時のコールバック。
   * 未指定の場合は削除 UI を無効化する。
   * Promise を返した場合は await し、reject した場合は ConfirmDialog を維持する。
   * @param destColumn - タスクの移動先カラム名。タスクが 0 件の場合は undefined
   */
  onDelete?: (destColumn: string | undefined) => void | Promise<void>;
  /** 削除操作を許可するか（false の場合は右クリックメニューの削除が無効化） */
  canDelete?: boolean;
  /** Board から渡される DragState（自カラムが drop ターゲットか判断）。 */
  dragState?: DragState;
  /** dragover 時の hoverIndex 通知。 */
  onDragHover?: (column: string | null, index: number | null) => void;
  /** drop 確定時の通知。 */
  onTaskDrop?: (params: ColumnTaskDropParams) => void;
  /**
   * 子 TaskCard の dragstart を Board に伝える。
   * @param taskFilePath 対象 task の filePath
   * @param fromColumn 元カラム名
   */
  onTaskDragStart?: (taskFilePath: string, fromColumn: string) => void;
  /** 子 TaskCard の dragend を Board に伝える。 */
  onTaskDragEnd?: () => void;
};

/**
 * ステータス別の個別カラムを表示する
 * @param props - {@link ColumnProps}
 * @returns カラム要素
 */
export const Column = ({
  name,
  tasks,
  allTasks = [],
  doneColumn,
  onAddClick,
  onTaskClick,
  onRename,
  existingColumnNames,
  onDelete,
  canDelete = true,
  dragState,
  onDragHover,
  onTaskDrop,
  onTaskDragStart,
  onTaskDragEnd,
}: ColumnProps) => {
  const tasksByFilePath = useMemo(
    () => new Map(allTasks.map((t) => [t.filePath, t])),
    [allTasks],
  );
  const listRef = useRef<HTMLUListElement>(null);
  // dragover は高頻度発火するため、rAF 同フレーム内では rect 再計算を 1 回に
  // 抑制する。pendingFrameRef が null でない間は新規 rAF を予約せず、最後の
  // clientY を上書きするだけ。
  const pendingFrameRef = useRef<number | null>(null);
  const pendingClientYRef = useRef(0);

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME_TYPE)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!onDragHover) {
      return;
    }
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
      onDragHover(name, index);
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
    onDragHover?.(null, null);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME_TYPE)) {
      return;
    }
    const taskFilePath = e.dataTransfer.getData(DRAG_MIME_TYPE);
    if (!taskFilePath || !dragState) {
      return;
    }
    if (taskFilePath !== dragState.draggingTaskFilePath) {
      return;
    }
    e.preventDefault();
    cancelPendingHover();
    // rAF throttle により dragState.hoverIndex は他カラムの drop で stale な
    // 可能性がある。drop event の clientY から this カラムの DOM rect を使って
    // toIndex を同期計算する。
    const liElements = Array.from(
      listRef.current?.querySelectorAll<HTMLLIElement>("li[data-task-card]") ??
        [],
    );
    const rects = liElements.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const toIndex = computeHoverIndex(rects, e.clientY);
    onTaskDrop?.({
      taskFilePath,
      fromColumn: dragState.draggingFromColumn,
      toColumn: name,
      toIndex,
    });
  };

  const showPlaceholder =
    dragState !== undefined &&
    dragState !== null &&
    dragState.hoverColumn === name &&
    dragState.hoverIndex !== null;
  const placeholderIndex =
    showPlaceholder && dragState ? dragState.hoverIndex : null;

  const otherColumnNames = existingColumnNames ?? [];
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

  const handleConfirm = async () => {
    // re-entrant guard: pending 中の confirm ボタン連打を抑止
    if (isDeleting) {
      return;
    }
    const hasTasksInside = tasks.length > 0;
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

  const handleCancel = () => {
    // pending 中はキャンセルも抑止
    if (isDeleting) {
      return;
    }
    setIsConfirming(false);
  };

  const hasTasks = tasks.length > 0;
  // pending 中も confirm ボタンを disabled にして二重実行を防ぐ
  const confirmDisabled = (hasTasks && destColumn === "") || isDeleting;
  // タスクが残っているのに移動先が無いとダイアログが「確定不能」になるため、
  // メニュー側で削除操作そのものを封じる。
  const canDeleteEffective =
    canDelete && !(hasTasks && otherColumnNames.length === 0);

  return (
    <section
      className="flex h-full w-72 min-w-72 flex-col rounded-lg bg-gray-50"
      aria-label={name}
      data-testid={`column-${name}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ColumnHeader
        name={name}
        taskCount={tasks.length}
        onAddClick={onAddClick}
        onRename={onRename}
        existingColumnNames={existingColumnNames}
        onContextMenu={handleContextMenu}
      />
      <ul ref={listRef} className="flex-1 overflow-y-auto px-2 pb-2">
        {tasks.map((task, i) => {
          const childTasks = task.hierarchy.childFilePaths
            .map((fp) => tasksByFilePath.get(fp))
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
                  doneColumn={doneColumn}
                  fromColumn={name}
                  isDragging={dragState?.draggingTaskFilePath === task.filePath}
                  onClick={onTaskClick}
                  onDragStart={onTaskDragStart}
                  onDragEnd={onTaskDragEnd}
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
              ? `「${name}」には ${tasks.length} 件のタスクがあります。移動先を選択してください。`
              : `「${name}」を削除します。よろしいですか？`
          }
          confirmLabel="削除"
          confirmDisabled={confirmDisabled}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        >
          {hasTasks && otherColumnNames.length > 0 && (
            <label className="mt-4 block text-sm text-gray-700">
              移動先カラム
              <select
                value={destColumn}
                onChange={(e) => setDestColumn(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
