import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditableText } from "@/components/EditableText";
import type { Priority } from "@/domains/priority";
import { useChildTasks } from "@/features/detail/hooks/useChildTasks";
import { useDeleteFlow } from "@/features/detail/hooks/useDeleteFlow";
import { useDetailLabels } from "@/features/detail/hooks/useDetailLabels";
import { useEscToClose } from "@/features/detail/hooks/useEscToClose";
import { useParentTask } from "@/features/detail/hooks/useParentTask";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";
import { LabelEditor } from "../LabelEditor";
import { LinksSection } from "../LinksSection";
import { MarkdownBody } from "../MarkdownBody";
import { ParentLink } from "../ParentLink";
import { PrioritySelect } from "../PrioritySelect";
import { StatusSelect } from "../StatusSelect";
import { SubIssueSection } from "../SubIssueSection";

/**
 * `onRemoveLink` 未指定時に LinksSection に渡す no-op fallback。
 * 既存呼出元が `onRemoveLink` を渡し忘れても × ボタンの click が型エラーで落ちないようにする。
 * 戻り値は `Result.err(undefined)` だが LinksSection の `useRemoveLink` は Result を捨てる
 * ため UI には影響しない（× クリックは isBusy トグルだけして何も起きない）。
 * @returns 常に `Result.err(undefined)`
 */
const noopRemoveLink = async (): Promise<Result<Task, unknown>> =>
  ResultDomain.err(undefined);

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
   * forward 削除では source=表示中タスク、reverse 削除では source=相手タスクが入る。
   * `onAddLink` と同じく LinksSection 描画には `onAddLink` の有無を条件とするため、
   * `onRemoveLink` の有無は描画判定には影響しない（無ければ × ボタンの click が no-op）。
   * @param sourceFilePath リンク元（md が書き換わる側）の filePath
   * @param targetFilePath リンク先の filePath
   * @returns invoke 結果
   */
  onRemoveLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
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
}: DetailPanelProps) => {
  const panelRef = useRef<HTMLElement>(null);

  const { childTasks, effectiveDoneColumn } = useChildTasks({
    parentFilePath: task.filePath,
    allTasks,
    columns,
    doneColumn,
  });

  const { parentTask } = useParentTask({ task, allTasks });

  const labels = useDetailLabels({ task, onTaskUpdate });

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
            {parentTask && onSelectTask && (
              <ParentLink parentTask={parentTask} onSelect={onSelectTask} />
            )}
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
            {onAddLink !== undefined && allTasks !== undefined && (
              // key=links-${task.id}: task 切替で LinksSection をリマウントし
              // popover の isOpen / 検索 query 等の内部 state を確実にリセットする。
              // MarkdownBody も同じ pattern で `key={task.id}` を使うため、ネームスペース
              // 接頭辞 "links-" で同階層でのキー衝突を防いでいる。
              <LinksSection
                key={`links-${task.id}`}
                task={task}
                allTasks={allTasks}
                parentFilePath={parentTask?.filePath ?? null}
                childrenFilePaths={childTasks.map((t) => t.filePath)}
                onAddLink={onAddLink}
                onRemoveLink={onRemoveLink ?? noopRemoveLink}
              />
            )}
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
