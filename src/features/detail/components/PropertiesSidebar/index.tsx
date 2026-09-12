import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDeleteFlowContext } from "@/features/detail/providers/DeleteFlowProvider";
import { useDetail } from "@/features/detail/providers/DetailProvider";
import { BrokenParentRow } from "../BrokenParentRow";
import { DetailFields } from "../DetailFields";
import { ParentLink } from "../ParentLink";

/** プロパティペインの Props */
export type PropertiesSidebarProps = {
  /**
   * アーカイブボタン押下時のコールバック。未指定ならボタンを表示しない。
   * アーカイブは復元可能な操作のため、削除と違い確認ダイアログは挟まない。
   */
  onArchive?: () => void;
};

/**
 * 詳細のプロパティペイン。DetailScreen の右サイドバー専用。
 * 最上部に ParentLink / BrokenParentRow（Parent はサイドバー集約）、続いて
 * DetailFields（Compound: Status/Priority・Labels・Draft・SubIssue・Links）、最下部に削除ボタンを置く。
 * 表示対象・親子・リンク切れは {@link useDetail}、削除フローは {@link useDeleteFlowContext} から読む。
 * 削除フロー（state machine + orphanStrategy）の所有権は DeleteFlowProvider にあり、
 * 本コンポーネントは context の値を描画し操作を context に返すだけ。
 * @param props - {@link PropertiesSidebarProps}
 * @returns プロパティペイン要素
 */
export const PropertiesSidebar = ({ onArchive }: PropertiesSidebarProps) => {
  const { task, parentTask, brokenLinks, onSelectTask } = useDetail();
  const deleteFlow = useDeleteFlowContext();

  const hasChildren = task.hierarchy.childFilePaths.length > 0;
  const rawAssignees = task.extras.assignees;
  const assignees = Array.isArray(rawAssignees)
    ? rawAssignees.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <aside data-testid="detail-properties" className="flex flex-col">
      <div className="border-b border-border px-[18px] py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          プロパティ
        </h2>
      </div>
      <section className="border-b border-border px-[18px] py-4">
        <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          担当者
        </h3>
        {assignees.length === 0 ? (
          <p className="text-xs italic text-text-dim">未割り当て</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assignees.map((assignee) => (
              <span
                key={assignee}
                className="inline-flex items-center gap-2 text-[12.5px]"
              >
                <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-white">
                  {assignee.slice(0, 2).toUpperCase()}
                </span>
                {assignee}
              </span>
            ))}
          </div>
        )}
      </section>
      {(task.due !== undefined || task.milestone !== undefined) && (
        <section className="border-b border-border px-[18px] py-4 text-[12.5px]">
          {task.due !== undefined && <p className="mb-2">期限 · {task.due}</p>}
          {task.milestone !== undefined && (
            <p>マイルストーン · {task.milestone}</p>
          )}
        </section>
      )}
      {parentTask && onSelectTask && (
        <ParentLink parentTask={parentTask} onSelect={onSelectTask} />
      )}
      {!parentTask &&
        brokenLinks.parent &&
        task.hierarchy.parentFilePath !== undefined && (
          <BrokenParentRow parentFilePath={task.hierarchy.parentFilePath} />
        )}
      <DetailFields>
        <DetailFields.StatusPriority />
        <DetailFields.Labels />
        <DetailFields.Draft />
        <DetailFields.SubIssue />
        <DetailFields.Links />
      </DetailFields>
      <section className="border-b border-border px-[18px] py-4">
        <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          ファイル
        </h3>
        <p className="break-all rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-[11px] text-muted">
          {task.filePath}
        </p>
      </section>
      <div className="flex flex-col gap-2 px-[18px] py-5">
        {onArchive && (
          <button
            type="button"
            className="w-full rounded-md border border-border bg-transparent px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:ring-offset-1"
            data-testid="detail-archive-button"
            onClick={onArchive}
          >
            アーカイブ
          </button>
        )}
        <button
          type="button"
          className="w-full rounded-md border border-red-300 bg-transparent px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
          data-testid="detail-delete-button"
          onClick={deleteFlow.requestDelete}
        >
          削除
        </button>
      </div>
      {deleteFlow.isOpen && (
        <ConfirmDialog
          title="タスクの削除"
          message={
            hasChildren
              ? `「${task.title || task.filePath}」を削除しますか？子タスクが ${task.hierarchy.childFilePaths.length} 件あります。`
              : `「${task.title || task.filePath}」を削除しますか？削除したタスクは設定のゴミ箱から復元できます。`
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
                  checked={deleteFlow.orphanStrategy === "clear"}
                  onChange={() => deleteFlow.setOrphanStrategy("clear")}
                  data-testid="delete-orphan-strategy-clear"
                />
                子タスクの親リンクを解除して削除（clear）
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orphan-strategy"
                  value="abort"
                  checked={deleteFlow.orphanStrategy === "abort"}
                  onChange={() => deleteFlow.setOrphanStrategy("abort")}
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
