import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { BrokenLinkSet } from "@/domains/broken-link";
import { Task } from "@/domains/task";
import type { UseChildTasksResult } from "@/features/detail/hooks/useChildTasks";
import type { UseDeleteFlowResult } from "@/features/detail/hooks/useDeleteFlow";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Column } from "@/types/column";
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
   * 削除フロー（DetailScreen が所有する useDeleteFlow の戻り値）。
   * 削除ボタン押下 / ConfirmDialog の開閉・確定・キャンセルに利用する。
   */
  deleteFlow: UseDeleteFlowResult;
  /** 子タスクがある場合の削除方針（clear / abort）。子なし時は無視される */
  orphanStrategy: OrphanStrategy;
  /**
   * 削除方針の変更ハンドラ。
   * @param strategy - 選択された削除方針
   */
  onOrphanStrategyChange: (strategy: OrphanStrategy) => void;
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
};

/**
 * 詳細のプロパティペイン。DetailScreen の右サイドバー専用。
 * 最上部に ParentLink / BrokenParentRow（Parent はサイドバー集約）、続いて
 * DetailFields（Compound: Status/Priority・Labels・SubIssue・Links）、最下部に削除ボタンを置く。
 * 削除フロー（useDeleteFlow + orphanStrategy）の所有権は DetailScreen にあり、本コンポーネントは
 * props で受け取った state を描画するだけの presentational コンポーネントとして振る舞う。
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
    deleteFlow,
    orphanStrategy,
    onOrphanStrategyChange,
    onAddSubIssue,
    onSelectTask,
    onAddLink,
    onRemoveLink,
  } = props;

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
        <DetailFields.Draft />
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
              ? `「${Task.displayTitle(task)}」を削除しますか？子タスクが ${task.hierarchy.childFilePaths.length} 件あります。`
              : `「${Task.displayTitle(task)}」を削除しますか？この操作は取り消せません。`
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
              className="mt-2 flex flex-col gap-1 rounded border border-border p-2 text-sm"
            >
              <p id="orphan-strategy-label" className="px-1 text-xs text-muted">
                子タスクの処理
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orphan-strategy"
                  value="clear"
                  checked={orphanStrategy === "clear"}
                  onChange={() => onOrphanStrategyChange("clear")}
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
                  onChange={() => onOrphanStrategyChange("abort")}
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
