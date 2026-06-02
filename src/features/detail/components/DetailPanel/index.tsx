import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditableText } from "@/components/EditableText";
import { getBrokenLinks } from "@/domains/broken-link";
import { useChildTasks } from "@/features/detail/hooks/useChildTasks";
import { useDeleteFlow } from "@/features/detail/hooks/useDeleteFlow";
import { useDetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { useEscToClose } from "@/features/detail/hooks/useEscToClose";
import { useParentTask } from "@/features/detail/hooks/useParentTask";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { BrokenParentRow } from "../BrokenParentRow";
import { CycleWarningBanner } from "../CycleWarningBanner";
import { DetailFields } from "../DetailFields";
import { MarkdownBody } from "../MarkdownBody";
import { ParentLink } from "../ParentLink";
import { ParseErrorBanner } from "../ParseErrorBanner";

/** 詳細パネルの Props */
type DetailPanelProps = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 全タスク一覧。サブIssue セクションの子タスク解決に利用する */
  allTasks?: Task[];
  /** 完了として扱うカラム名。サブIssue の完了判定に使用 */
  doneColumn?: string;
  /** パネルを閉じるコールバック */
  onClose: () => void;
  /**
   * タスク更新時のコールバック
   * @param id - 更新対象のタスクID
   * @param updates - 更新するフィールド
   */
  onTaskUpdate: (id: string, updates: Partial<Omit<Task, "id">>) => void;
  /**
   * タスク削除時のコールバック
   * @param id - 削除対象のタスクID
   * @param orphanStrategy - 子タスクがある場合の処理方針（子なし時は未指定）
   */
  onDelete: (
    id: string,
    orphanStrategy?: OrphanStrategy,
  ) => void | Promise<void>;
  /**
   * サブIssue 追加ボタン押下時のコールバック。
   * 指定された親タスクのファイルパスでタスク作成フォームを開く想定。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue?: (parentFilePath: string) => void;
  /**
   * 別のタスクへ詳細パネルの表示対象を切り替えるコールバック。
   * @param taskId - 切り替え先タスクの id
   */
  onSelectTask?: (taskId: string) => void;
  /**
   * リンク追加コールバック。source / target の filePath を受け取る。
   * 渡されない場合や `allTasks` が undefined の場合は LinksSection を描画しない。
   * @param sourceFilePath リンク元 filePath
   * @param targetFilePath リンク先 filePath
   * @returns invoke 結果
   */
  onAddLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * リンク削除コールバック。source / target の filePath を受け取る。
   * forward 削除のみが対象（source=表示中タスク）。reverse 行には削除 UI がない。
   * @param sourceFilePath リンク元（md が書き換わる側）の filePath
   * @param targetFilePath リンク先の filePath
   * @returns invoke 結果
   */
  onRemoveLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * 「正規化済み Task.filePath → Task」の lookup Map。
   * 渡された場合のみ broken link 判定を行い、parent / links / children / reverseLinks の
   * 4 箇所にリンク切れ警告を表示する。未指定時は警告 UI を出さない（後方互換）。
   */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** 「全画面で開く」押下ハンドラ。未指定時はボタンを表示しない（後方互換）。 */
  onExpand?: () => void;
};

/**
 * 右側からスライドインするタスク詳細パネル
 * @param props - {@link DetailPanelProps}
 * @returns パネル要素
 */
export const DetailPanel = ({
  task,
  columns,
  allTasks,
  doneColumn,
  onClose,
  onTaskUpdate,
  onDelete,
  onAddSubIssue,
  onSelectTask,
  onAddLink,
  onRemoveLink,
  tasksByNormalizedPath,
  onExpand,
}: DetailPanelProps) => {
  const panelRef = useRef<HTMLElement>(null);

  const { childTasks, descendantTasks, effectiveDoneColumn } = useChildTasks({
    parentFilePath: task.filePath,
    allTasks,
    columns,
    doneColumn,
  });

  const { parentTask } = useParentTask({ task, allTasks });

  const fieldHandlers = useDetailFieldHandlers(task, onTaskUpdate);

  const brokenLinks = useMemo(
    () => getBrokenLinks(task, tasksByNormalizedPath),
    [task, tasksByNormalizedPath],
  );

  const [orphanStrategy, setOrphanStrategy] = useState<OrphanStrategy>("clear");

  const handleDelete = useCallback(() => {
    if (task.hierarchy.childFilePaths.length > 0) {
      return onDelete(task.id, orphanStrategy);
    }
    return onDelete(task.id);
  }, [task.id, task.hierarchy.childFilePaths.length, orphanStrategy, onDelete]);
  const deleteFlow = useDeleteFlow({ onDelete: handleDelete });

  useEffect(() => {
    if (deleteFlow.isOpen) {
      setOrphanStrategy("clear");
    }
  }, [deleteFlow.isOpen]);

  useEscToClose({
    disabled: deleteFlow.isOpen,
    onEscape: onClose,
  });

  const handleTitleConfirm = useCallback(
    (title: string) => {
      onTaskUpdate(task.id, { title });
    },
    [task.id, onTaskUpdate],
  );

  const handleBodyConfirm = useCallback(
    (body: string) => {
      onTaskUpdate(task.id, { body });
    },
    [task.id, onTaskUpdate],
  );

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="詳細パネルを閉じる"
        className="fixed inset-0 z-40 border-0 bg-black/30 p-0"
        data-testid="detail-overlay"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="タスク詳細"
        tabIndex={-1}
        className="fixed top-0 right-0 z-50 flex h-full w-[480px] max-w-full animate-slide-in flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CycleWarningBanner task={task} />
            <ParseErrorBanner task={task} />
            {parentTask && onSelectTask && (
              <ParentLink parentTask={parentTask} onSelect={onSelectTask} />
            )}
            {!parentTask &&
              brokenLinks.parent &&
              task.hierarchy.parentFilePath !== undefined && (
                <BrokenParentRow
                  parentFilePath={task.hierarchy.parentFilePath}
                />
              )}
            <EditableText
              key={task.id}
              value={task.title || task.filePath}
              onConfirm={handleTitleConfirm}
              ariaLabel="タスクタイトル"
            />
          </div>
          {onExpand && (
            <button
              type="button"
              aria-label="全画面で開く"
              data-testid="detail-expand-button"
              className="ml-2 shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              onClick={onExpand}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l3.293 3.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm14 12a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-3.293-3.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 012 0v4z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            aria-label="閉じる"
            className="ml-2 shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            onClick={onClose}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <DetailFields
              task={task}
              columns={columns}
              allTasks={allTasks}
              childTasks={childTasks}
              descendantTasks={descendantTasks}
              effectiveDoneColumn={effectiveDoneColumn}
              parentTask={parentTask}
              brokenLinks={brokenLinks}
              onStatusChange={fieldHandlers.onStatusChange}
              onPriorityChange={fieldHandlers.onPriorityChange}
              onLabelAdd={fieldHandlers.onLabelAdd}
              onLabelRemove={fieldHandlers.onLabelRemove}
              onAddSubIssue={onAddSubIssue}
              onSelectTask={onSelectTask}
              onAddLink={onAddLink}
              onRemoveLink={onRemoveLink}
            />
            {/* key={task.id}: 編集中に表示対象タスクが切替わった場合、 */}
            {/* MarkdownBody を再マウントして edit 状態をリセットする（stale state 防止）。 */}
            <MarkdownBody
              key={task.id}
              body={task.body}
              onConfirm={handleBodyConfirm}
            />
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-3">
          <p
            className="mb-3 truncate text-xs text-gray-400"
            data-testid="detail-file-path"
          >
            {task.filePath}
          </p>
          <button
            type="button"
            className="w-full rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            data-testid="detail-delete-button"
            onClick={deleteFlow.requestDelete}
          >
            削除
          </button>
        </div>
      </aside>
      {deleteFlow.isOpen && (
        <ConfirmDialog
          title="タスクの削除"
          message={
            task.hierarchy.childFilePaths.length > 0
              ? `「${task.title || task.filePath}」を削除しますか？子タスクが ${task.hierarchy.childFilePaths.length} 件あります。`
              : `「${task.title || task.filePath}」を削除しますか？この操作は取り消せません。`
          }
          confirmLabel={deleteFlow.isBusy ? "削除中…" : "削除"}
          confirmDisabled={deleteFlow.isBusy}
          cancelDisabled={deleteFlow.isBusy}
          onConfirm={deleteFlow.confirmDelete}
          onCancel={deleteFlow.cancelDelete}
        >
          {task.hierarchy.childFilePaths.length > 0 && (
            <div
              role="radiogroup"
              aria-labelledby="orphan-strategy-label"
              data-testid="delete-orphan-strategy-radiogroup"
              className="mt-2 flex flex-col gap-1 rounded border border-gray-200 p-2 text-sm"
            >
              <p
                id="orphan-strategy-label"
                className="px-1 text-xs text-gray-600"
              >
                子タスクの処理
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orphan-strategy"
                  value="clear"
                  checked={orphanStrategy === "clear"}
                  onChange={() => setOrphanStrategy("clear")}
                  data-testid="delete-orphan-strategy-clear"
                />
                子タスクの親リンクを解除して削除（clear）
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orphan-strategy"
                  value="abort"
                  checked={orphanStrategy === "abort"}
                  onChange={() => setOrphanStrategy("abort")}
                  data-testid="delete-orphan-strategy-abort"
                />
                削除を中止（abort）
              </label>
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
};
