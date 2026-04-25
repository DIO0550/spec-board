import { useCallback, useEffect, useRef } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditableText } from "@/components/EditableText";
import type { Priority } from "@/domains/priority";
import { useChildTasks } from "@/features/detail/hooks/useChildTasks";
import { useDeleteFlow } from "@/features/detail/hooks/useDeleteFlow";
import { useDetailLabels } from "@/features/detail/hooks/useDetailLabels";
import { useEscToClose } from "@/features/detail/hooks/useEscToClose";
import type { Column, Task } from "@/types/task";
import { LabelEditor } from "../LabelEditor";
import { MarkdownBody } from "../MarkdownBody";
import { PrioritySelect } from "../PrioritySelect";
import { StatusSelect } from "../StatusSelect";
import { SubIssueSection } from "../SubIssueSection";

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
   */
  onDelete: (id: string) => void | Promise<void>;
  /**
   * サブIssue 追加ボタン押下時のコールバック。
   * 指定された親タスクのファイルパスでタスク作成フォームを開く想定。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue?: (parentFilePath: string) => void;
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
}: DetailPanelProps) => {
  const panelRef = useRef<HTMLElement>(null);

  const { childTasks, effectiveDoneColumn } = useChildTasks({
    parentFilePath: task.filePath,
    allTasks,
    columns,
    doneColumn,
  });

  const labels = useDetailLabels({ task, onTaskUpdate });

  const handleDelete = useCallback(
    () => onDelete(task.id),
    [task.id, onDelete],
  );
  const deleteFlow = useDeleteFlow({ onDelete: handleDelete });

  useEscToClose({
    disabled: deleteFlow.state.kind !== "idle",
    onEscape: onClose,
  });

  const handleTitleConfirm = useCallback(
    (title: string) => {
      onTaskUpdate(task.id, { title });
    },
    [task.id, onTaskUpdate],
  );

  const handleStatusChange = useCallback(
    (status: string) => {
      onTaskUpdate(task.id, { status });
    },
    [task.id, onTaskUpdate],
  );

  const handlePriorityChange = useCallback(
    (priority: Priority | undefined) => {
      onTaskUpdate(task.id, { priority });
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
          <div className="min-w-0 flex-1">
            <EditableText
              value={task.title || task.filePath}
              onConfirm={handleTitleConfirm}
              ariaLabel="タスクタイトル"
            />
          </div>
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
            <div className="flex gap-4">
              <StatusSelect
                value={task.status}
                columns={columns}
                onChange={handleStatusChange}
              />
              <PrioritySelect
                value={task.priority}
                onChange={handlePriorityChange}
              />
            </div>
            <LabelEditor
              labels={task.labels}
              onAdd={labels.add}
              onRemove={labels.remove}
            />
            {onAddSubIssue && allTasks !== undefined && (
              <SubIssueSection
                parentTask={task}
                childTasks={childTasks}
                doneColumn={effectiveDoneColumn}
                onAddSubIssue={onAddSubIssue}
              />
            )}
            <MarkdownBody body={task.body} />
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
      {(deleteFlow.state.kind === "confirming" ||
        deleteFlow.state.kind === "deleting" ||
        deleteFlow.state.kind === "error") && (
        <ConfirmDialog
          title="タスクの削除"
          message={`「${task.title || task.filePath}」を削除しますか？この操作は取り消せません。`}
          confirmLabel={
            deleteFlow.state.kind === "deleting" ? "削除中…" : "削除"
          }
          confirmDisabled={deleteFlow.state.kind === "deleting"}
          cancelDisabled={deleteFlow.state.kind === "deleting"}
          onConfirm={deleteFlow.confirmDelete}
          onCancel={deleteFlow.cancelDelete}
        />
      )}
    </>
  );
};
