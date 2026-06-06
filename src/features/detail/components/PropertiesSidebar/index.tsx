import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { BrokenLinkSet } from "@/domains/broken-link";
import type { UseChildTasksResult } from "@/features/detail/hooks/useChildTasks";
import { useDeleteFlow } from "@/features/detail/hooks/useDeleteFlow";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { BrokenParentRow } from "../BrokenParentRow";
import { DetailFields } from "../DetailFields";
import { ParentLink } from "../ParentLink";

/** プロパティペイン（DetailFields + 削除）の Props */
export type PropertiesSidebarProps = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 全タスク一覧。SubIssue / Links セクションの解決に利用する */
  allTasks?: Task[];
  /** 子タスク解決結果（useChildTasks の戻り値） */
  childInfo: UseChildTasksResult;
  /** 親タスク（無ければ null） */
  parentTask: Task | null;
  /** リンク切れ判定結果 */
  brokenLinks: BrokenLinkSet;
  /** ステータス/優先度/ラベルの編集ハンドラ */
  handlers: DetailFieldHandlers;
  /**
   * サブIssue 追加ハンドラ。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue?: (parentFilePath: string) => void;
  /**
   * 別タスクへ表示対象を切り替えるハンドラ。
   * @param taskId - 切り替え先タスクの id
   */
  onSelectTask?: (taskId: string) => void;
  /**
   * リンク追加ハンドラ。
   * @param sourceFilePath - リンク元 filePath
   * @param targetFilePath - リンク先 filePath
   * @returns invoke 結果
   */
  onAddLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * リンク削除ハンドラ。
   * @param sourceFilePath - リンク元 filePath
   * @param targetFilePath - リンク先 filePath
   * @returns invoke 結果
   */
  onRemoveLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * タスク削除ハンドラ。
   * @param id - 削除対象のタスク ID
   * @param orphanStrategy - 子タスクがある場合の処理方針（子なし時は未指定）
   */
  onDelete: (
    id: string,
    orphanStrategy?: OrphanStrategy,
  ) => void | Promise<void>;
  /**
   * 削除 ConfirmDialog の開閉が変化したらコンテナへ通知する。
   * DetailScreen はこれを useEscToClose の disabled に渡し、
   * ダイアログ表示中の Esc が「戻る」を誤発火しないようにする。
   * @param open - ダイアログが開いているか
   */
  onDeleteFlowOpenChange?: (open: boolean) => void;
};

/**
 * 詳細のプロパティペイン。DetailScreen の右サイドバー専用。
 * 最上部に ParentLink / BrokenParentRow（Parent はサイドバー集約）、続いて
 * DetailFields（Compound: Status/Priority・Labels・SubIssue・Links）、最下部に削除ボタンを置く。
 * 削除フロー（useDeleteFlow + orphanStrategy + ConfirmDialog）を内包し、
 * 開閉を onDeleteFlowOpenChange でコンテナへ通知する。
 * @param props - {@link PropertiesSidebarProps}
 * @returns プロパティペイン要素
 */
export const PropertiesSidebar = (props: PropertiesSidebarProps) => {
  const {
    task,
    columns,
    allTasks,
    childInfo,
    parentTask,
    brokenLinks,
    handlers,
    onAddSubIssue,
    onSelectTask,
    onAddLink,
    onRemoveLink,
    onDelete,
    onDeleteFlowOpenChange,
  } = props;

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

  // ダイアログ開閉が「変化したときのみ」通知する。初回 false の誤通知を避けるため
  // prevOpenRef で前回値と比較する（StrictMode 二重 effect でも重複しない）。
  const prevOpenRef = useRef(deleteFlow.isOpen);
  useEffect(() => {
    if (prevOpenRef.current !== deleteFlow.isOpen) {
      prevOpenRef.current = deleteFlow.isOpen;
      onDeleteFlowOpenChange?.(deleteFlow.isOpen);
    }
  }, [deleteFlow.isOpen, onDeleteFlowOpenChange]);

  const hasChildren = task.hierarchy.childFilePaths.length > 0;

  return (
    <aside className="flex flex-col gap-4">
      {parentTask && onSelectTask && (
        <ParentLink parentTask={parentTask} onSelect={onSelectTask} />
      )}
      {!parentTask &&
        brokenLinks.parent &&
        task.hierarchy.parentFilePath !== undefined && (
          <BrokenParentRow parentFilePath={task.hierarchy.parentFilePath} />
        )}
      <DetailFields task={task} columns={columns} handlers={handlers}>
        <DetailFields.StatusPriority />
        <DetailFields.Labels />
        {onAddSubIssue && allTasks !== undefined && (
          <DetailFields.SubIssue
            childInfo={childInfo}
            brokenChildPaths={brokenLinks.children}
            onAddSubIssue={onAddSubIssue}
            onChildClick={onSelectTask}
          />
        )}
        {onAddLink !== undefined && allTasks !== undefined && (
          <DetailFields.Links
            allTasks={allTasks}
            parentFilePath={parentTask?.filePath ?? null}
            childrenFilePaths={childInfo.childTasks.map((t) => t.filePath)}
            onAddLink={onAddLink}
            onRemoveLink={onRemoveLink}
            onLinkClick={onSelectTask}
            brokenLinkPaths={brokenLinks.links}
            brokenReverseLinkPaths={brokenLinks.reverseLinks}
          />
        )}
      </DetailFields>
      <button
        type="button"
        className="w-full rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
        data-testid="detail-delete-button"
        onClick={deleteFlow.requestDelete}
      >
        削除
      </button>
      {deleteFlow.isOpen && (
        <ConfirmDialog
          title="タスクの削除"
          message={
            hasChildren
              ? `「${task.title || task.filePath}」を削除しますか？子タスクが ${task.hierarchy.childFilePaths.length} 件あります。`
              : `「${task.title || task.filePath}」を削除しますか？この操作は取り消せません。`
          }
          confirmLabel={deleteFlow.isBusy ? "削除中…" : "削除"}
          confirmDisabled={deleteFlow.isBusy}
          cancelDisabled={deleteFlow.isBusy}
          onConfirm={deleteFlow.confirmDelete}
          onCancel={deleteFlow.cancelDelete}
        >
          {hasChildren && (
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
    </aside>
  );
};
