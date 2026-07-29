import { useEffect, useMemo, useState } from "react";
import { Due } from "@/domains/due";
import { Milestone } from "@/domains/milestone";
import {
  MilestoneProjection,
  type MilestoneProjectionMap,
} from "@/domains/milestone-projection";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { MilestoneCreateModal } from "@/features/milestoneView/components/MilestoneCreateModal";
import { MilestoneDetailSidebar } from "@/features/milestoneView/components/MilestoneDetailSidebar";
import { MilestoneList } from "@/features/milestoneView/components/MilestoneList";
import { MilestoneRoadmap } from "@/features/milestoneView/components/MilestoneRoadmap";
import {
  MilestoneToolbar,
  type ViewMode,
} from "@/features/milestoneView/components/MilestoneToolbar";
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
  /** 全タスク（サイドバーのtask path解決用） */
  tasks: Task[];
  /** done とみなすカラム名（未解決は undefined） */
  doneColumn: string | undefined;
  /** BE が task snapshot と同時生成した milestone projection map */
  milestoneProjections: MilestoneProjectionMap;
  /** sidebar の done 表示に使う task projection map */
  taskProjections: TaskProjectionMap;
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
 * マイルストーン別ビュー（専用画面）。
 * 仕様: docs/spec-board/milestone-view-spec.md
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
  milestoneProjections,
  taskProjections,
  onCreateMilestone,
  isCreating = false,
}: MilestoneViewScreenProps) => {
  const sorted = useMemo(
    () => Milestone.sortByOrder(resource.milestones),
    [resource.milestones],
  );
  const [filter, setFilter] = useState<StateFilter>("all");
  const [query, setQuery] = useState("");
  // milestones.yml で定義された order を尊重した既定順序を初期値にする。
  // Milestone.sortByOrder() の結果を listOps の安定ソートが保つ。
  const [sort, setSort] = useState<SortKey>("order");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedName, setSelectedName] = useState<string | undefined>(
    undefined,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // 今日の日付キー (YYYY-MM-DD)。日付がまたぐと変わり、それを依存配列に入れることで
  // overdue 判定を含む派生値 (visible / stats) を当日内ではメモ化したまま日付変更時に
  // 強制再計算する。
  // 画面を開きっぱなしで他に state 変更が無いケース (バックグラウンドタブ等) では
  // 再 render が起きないため、setTimeout で次のローカル midnight にスケジュールして
  // setTodayKey を呼ぶことで自動的に再 render を起こす。
  const [todayKey, setTodayKey] = useState(Due.todayLocal);
  // biome-ignore lint/correctness/useExhaustiveDependencies: todayKey 変更後に次の midnight を再スケジュールするため依存に含める（body 内で参照しないが意図的）
  useEffect(() => {
    const nowDate = new Date();
    const nextMidnight = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const msUntilMidnight = nextMidnight.getTime() - nowDate.getTime();
    const timer = setTimeout(() => {
      setTodayKey(Due.todayLocal());
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, [todayKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 日付キーが変わった時に新しい Date を再生成するため todayKey を依存に含める（body 内で参照しないが意図的）
  const now = useMemo(() => new Date(), [todayKey]);

  const visible = useMemo(() => {
    const filtered = filterMilestones(sorted, { state: filter, query }, now);
    return sortMilestones(
      filtered,
      sort,
      milestoneProjections,
      doneColumn !== undefined,
    );
  }, [sorted, filter, query, sort, milestoneProjections, doneColumn, now]);

  const stats = useMemo(() => groupByDisplayStatus(sorted, now), [sorted, now]);
  const taskCounts = useMemo(
    () => MilestoneProjection.sum(milestoneProjections),
    [milestoneProjections],
  );
  const tasksByFilePath = useMemo(
    () => new Map(tasks.map((task) => [task.filePath, task])),
    [tasks],
  );

  const selectedDef = useMemo(
    () =>
      selectedName === undefined
        ? undefined
        : sorted.find((m) => m.name === selectedName),
    [sorted, selectedName],
  );
  // 上の filterMilestones / groupByDisplayStatus と同じ now を渡して overdue
  // 基準を揃える（midnight setTimeout が遅延した場合の判定ズレを防ぐ）。
  const selectedStatus =
    selectedDef === undefined
      ? undefined
      : resolveDisplayStatus(selectedDef, now);
  const selectedProjection =
    selectedName === undefined
      ? undefined
      : MilestoneProjection.findByName(milestoneProjections, selectedName);
  const selectedTasks = useMemo(() => {
    if (selectedProjection === undefined) {
      return [];
    }
    return selectedProjection.taskFilePaths.flatMap((filePath) => {
      const task = tasksByFilePath.get(filePath);
      return task === undefined ? [] : [task];
    });
  }, [selectedProjection, tasksByFilePath]);

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
      <div className="flex w-full flex-1 flex-col bg-surface-muted p-6">
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
        <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-border bg-surface-muted p-12 text-center">
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
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-surface-muted p-6">
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
              statusOf={(d) => resolveDisplayStatus(d, now)}
              projectionOf={(d) =>
                MilestoneProjection.findByName(milestoneProjections, d.name)
              }
              showRatio={doneColumn !== undefined}
              selectedName={selectedName}
              onSelect={(d) => setSelectedName(d.name)}
              now={now}
            />
          ) : (
            <MilestoneRoadmap
              milestones={visible}
              selectedName={selectedName}
              onSelect={(d) => setSelectedName(d.name)}
              now={now}
            />
          )}
        </div>
        <MilestoneDetailSidebar
          def={selectedDef}
          status={selectedStatus}
          projection={selectedProjection}
          showRatio={doneColumn !== undefined}
          tasks={selectedTasks}
          taskProjections={taskProjections}
          now={now}
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
