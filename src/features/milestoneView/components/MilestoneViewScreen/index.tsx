import { useMemo, useState } from "react";
import { Milestone } from "@/domains/milestone";
import { MilestoneCreateModal } from "@/features/milestoneView/components/MilestoneCreateModal";
import { MilestoneDetailSidebar } from "@/features/milestoneView/components/MilestoneDetailSidebar";
import { MilestoneList } from "@/features/milestoneView/components/MilestoneList";
import { MilestoneRoadmap } from "@/features/milestoneView/components/MilestoneRoadmap";
import {
  MilestoneToolbar,
  type ViewMode,
} from "@/features/milestoneView/components/MilestoneToolbar";
import { useMilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import {
  filterMilestones,
  groupByDisplayStatus,
  type SortKey,
  type StateFilter,
  sortMilestones,
} from "@/features/milestoneView/lib/listOps";
import { resolveDisplayStatus } from "@/features/milestoneView/lib/milestoneStatus";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { CreateMilestoneArgs } from "@/lib/tauri";
import type { Task } from "@/types/task";

type MilestoneViewScreenProps = {
  /** マイルストーンリソース（唯一の取得点から配る） */
  resource: MilestonesResource;
  /** 全タスク（進捗算出・サイドバー task list 用） */
  tasks: Task[];
  /** done とみなすカラム名（未解決は undefined） */
  doneColumn: string | undefined;
  /**
   * マイルストーンを作成する。成功なら true、失敗 / pending 中なら false。
   * 未指定なら追加ボタン自体を表示しない（プレビュー / 閲覧専用モード）。
   * @param args - 作成内容
   * @returns 成功なら true
   */
  onCreateMilestone?: (args: CreateMilestoneArgs) => Promise<boolean>;
  /** create が pending 中かどうか（送信ボタン disabled に使う） */
  isCreating?: boolean;
};

/**
 * マイルストーン別ビュー（専用画面）。design-source:
 * docs/design/spec-milestones-static-{list,roadmap,modal}.html。
 *
 * 上部にツールバー（状態フィルタ / 検索 / ソート / 一覧⇄ロードマップ切替）、
 * 左にメイン（list or roadmap）、右にサイドバー（選択中マイルストーンの詳細）。
 * 一覧では `data-testid="milestone-view-row"` + `data-testid="milestone-progress-bar"`
 * を維持し、既存のスナップショット/挙動テストとの後方互換を保つ。
 *
 * @param props - {@link MilestoneViewScreenProps}
 * @returns マイルストーンビュー要素
 */
export const MilestoneViewScreen = ({
  resource,
  tasks,
  doneColumn,
  onCreateMilestone,
  isCreating = false,
}: MilestoneViewScreenProps) => {
  const sorted = useMemo(
    () => Milestone.sortByOrder(resource.milestones),
    [resource.milestones],
  );
  const names = useMemo(() => sorted.map((m) => m.name), [sorted]);
  const progress = useMilestoneProgress({
    milestoneNames: names,
    tasks,
    doneColumn,
  });

  const [filter, setFilter] = useState<StateFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedName, setSelectedName] = useState<string | undefined>(
    undefined,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const filtered = filterMilestones(sorted, { state: filter, query });
    return sortMilestones(filtered, sort, progress);
  }, [sorted, filter, query, sort, progress]);

  const stats = useMemo(() => groupByDisplayStatus(sorted), [sorted]);
  const taskCounts = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.milestone === undefined) {
        continue;
      }
      total += 1;
      if (doneColumn !== undefined && t.status === doneColumn) {
        done += 1;
      }
    }
    return { total, done };
  }, [tasks, doneColumn]);

  const selectedDef = useMemo(
    () =>
      selectedName === undefined
        ? undefined
        : sorted.find((m) => m.name === selectedName),
    [sorted, selectedName],
  );
  const selectedStatus =
    selectedDef === undefined ? undefined : resolveDisplayStatus(selectedDef);
  const selectedTasks = useMemo(
    () =>
      selectedName === undefined
        ? []
        : tasks.filter((t) => t.milestone === selectedName),
    [tasks, selectedName],
  );

  if (resource.status === "loading" || resource.status === "idle") {
    return <p className="p-4 text-sm text-muted">読み込み中…</p>;
  }
  if (resource.status === "error") {
    return (
      <p className="p-4 text-sm text-muted">
        マイルストーンを読み込めませんでした
      </p>
    );
  }
  // 空状態でも作成導線がある場合はヘッダ + プレースホルダを描画し、
  // 「空 = どこからも作成できない」を解消する（App.tsx は常に作成 mutation を渡す）。
  if (sorted.length === 0) {
    if (onCreateMilestone === undefined) {
      return <p className="p-4 text-sm text-muted">マイルストーンなし</p>;
    }
    return (
      <div className="flex w-full flex-1 flex-col bg-bg p-6">
        <header className="mb-6 flex items-baseline gap-4">
          <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
            マイルストーン
          </h2>
          <button
            type="button"
            data-testid="milestone-create-open"
            onClick={() => setIsCreateOpen(true)}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            + マイルストーンを追加
          </button>
        </header>
        <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-border bg-panel-2 p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted">
              マイルストーンがまだ登録されていません
            </p>
            <button
              type="button"
              data-testid="milestone-create-open-empty"
              onClick={() => setIsCreateOpen(true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              + 最初のマイルストーンを作成
            </button>
          </div>
        </div>
        {isCreateOpen ? (
          <MilestoneCreateModal
            onCreate={onCreateMilestone}
            isPending={isCreating}
            onClose={() => setIsCreateOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-bg p-6">
      <header className="mb-4 flex items-baseline gap-4">
        <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
          マイルストーン
        </h2>
        <p
          className="flex items-baseline gap-3 text-xs text-muted"
          data-testid="milestone-view-stats"
        >
          <span>
            <span className="font-mono font-semibold text-foreground">
              {stats.open.length}
            </span>{" "}
            オープン
          </span>
          <span>
            <span className="font-mono font-semibold text-foreground">
              {stats.closed.length}
            </span>{" "}
            クローズ
          </span>
          <span className="text-[var(--color-ms-danger-fg)]">
            <span className="font-mono font-semibold">
              {stats.overdue.length}
            </span>{" "}
            期限超過
          </span>
          <span>
            <span className="font-mono font-semibold text-foreground">
              {taskCounts.done}/{taskCounts.total}
            </span>{" "}
            タスク完了
          </span>
        </p>
        {onCreateMilestone !== undefined ? (
          <button
            type="button"
            data-testid="milestone-create-open"
            onClick={() => setIsCreateOpen(true)}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            + マイルストーンを追加
          </button>
        ) : null}
      </header>

      <div className="mb-4">
        <MilestoneToolbar
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
        />
      </div>

      <div className="flex flex-1 gap-4">
        <div className="min-w-0 flex-1">
          {view === "list" ? (
            <MilestoneList
              milestones={visible}
              statusOf={(d) => resolveDisplayStatus(d)}
              progressOf={(d) => progress.get(d.name)}
              selectedName={selectedName}
              onSelect={(d) => setSelectedName(d.name)}
            />
          ) : (
            <MilestoneRoadmap
              milestones={visible}
              selectedName={selectedName}
              onSelect={(d) => setSelectedName(d.name)}
            />
          )}
        </div>
        <MilestoneDetailSidebar
          def={selectedDef}
          status={selectedStatus}
          progress={
            selectedDef === undefined
              ? undefined
              : progress.get(selectedDef.name)
          }
          tasks={selectedTasks}
          doneColumn={doneColumn}
        />
      </div>

      {isCreateOpen && onCreateMilestone !== undefined ? (
        <MilestoneCreateModal
          onCreate={onCreateMilestone}
          isPending={isCreating}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
    </div>
  );
};
