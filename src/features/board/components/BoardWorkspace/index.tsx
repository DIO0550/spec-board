import { useEffect, useMemo, useRef, useState } from "react";
import {
  type TabItem,
  TabNav,
  tabNavPanelId,
  tabNavTabId,
} from "@/components/TabNav";
import type { TaskForest } from "@/domains/task-forest";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { ActiveBoardView } from "@/features/board/components/ActiveBoardView";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Column as ColumnType } from "@/types/column";
import type { Task } from "@/types/task";
import {
  type BoardViewMode,
  useBoardViewMode,
} from "../../hooks/useBoardViewMode";
import { useTaskFilter } from "../../hooks/useTaskFilter";
// 型 import は export 化した BoardWorkspaceProps が参照するため残す（削除すると build が落ちる）。
import type { TaskDropHandler } from "../BoardCardProvider";
import type { ColumnReorderHandler } from "../BoardColumnProvider";
import type { MilestonesByName } from "../TaskCard";
import { TaskFilterBar } from "../TaskFilterBar";

type ViewIconKind =
  | "board"
  | "list"
  | "tree"
  | "calendar"
  | "roadmap"
  | "guide";

const ViewIcon = ({ kind }: { kind: ViewIconKind }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="size-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {kind === "board" && (
      <>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="10" rx="1" />
        <rect x="17" y="4" width="4" height="14" rx="1" />
      </>
    )}
    {kind === "list" && <path d="M3 6h18M3 12h18M3 18h18" />}
    {kind === "tree" && (
      <>
        <rect x="4" y="6" width="4" height="4" />
        <path d="M10 6h10M4 14h4v4H4zM10 16h10" />
      </>
    )}
    {kind === "calendar" && (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    )}
    {kind === "roadmap" && <path d="M3 7h6M3 12h12M3 17h9M21 7l-3 3 3 3" />}
    {kind === "guide" && <path d="M4 4h16v4H4zM4 12h10v4H4zM4 20h6" />}
  </svg>
);
/** ビュー切替タブの定義（表示形態 ID と表示名）。 */
const buildViewTabs = (
  taskCount: number,
  includeGuide: boolean,
): readonly TabItem[] => [
  {
    id: "board",
    label: "ボード",
    icon: <ViewIcon kind="board" />,
    count: taskCount,
  },
  {
    id: "list",
    label: "一覧",
    icon: <ViewIcon kind="list" />,
    count: taskCount,
  },
  { id: "tree", label: "ツリー", icon: <ViewIcon kind="tree" /> },
  { id: "calendar", label: "カレンダー", icon: <ViewIcon kind="calendar" /> },
  { id: "roadmap", label: "ロードマップ", icon: <ViewIcon kind="roadmap" /> },
  ...(includeGuide
    ? [{ id: "guide", label: "GUIDE.md", icon: <ViewIcon kind="guide" /> }]
    : []),
];

/** サブバー / tabpanel の DOM id に使う接頭辞。 */
const VIEW_TAB_PREFIX = "board-view";

/** BoardWorkspace の Props。 */
export type BoardWorkspaceProps = {
  /** toolbar等に表示する実project名。 */
  projectName?: string;
  /** カラム定義の配列 */
  columns: ColumnType[];
  /** 全タスク（絞り込み前） */
  tasks: Task[];
  /** 正規化済み Task.filePath → Task の lookup Map（broken link 判定用） */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** 完了カラム名 */
  doneColumn?: string;
  /** filePath -> projection（BE 集計）。BoardView へそのまま渡す。 */
  projections: TaskProjectionMap;
  /**
   * BE 由来の全タスク正準ツリー。TreeView が可視集合で枝刈りして使う。
   * 絞り込みは適用されていない（`filtered` 側が可視集合の真実源）。
   */
  taskTree: TaskForest;
  /** name → マイルストーン定義の Map（カードバッジ用） */
  milestonesByName?: MilestonesByName;
  /** 絞り込み UI に並べるマイルストーン定義 */
  milestones?: readonly MilestoneDefinition[];
  /**
   * カラムの「+ 追加」クリック時のコールバック。
   * @param columnName - 追加対象のカラム名
   */
  onAddTask: (columnName: string) => void;
  /** カレンダーの日付cell起点で作成する。 */
  onAddTaskForDate?: (date: string) => void;
  /**
   * タスククリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick: (taskId: string) => void;
  /**
   * 新規カラム追加時のコールバック。
   * @param columnName - 追加するカラム名
   */
  onAddColumn?: (columnName: string) => void;
  /**
   * カラム名リネーム確定時のコールバック。
   * @param oldName - 元のカラム名
   * @param newName - 新しいカラム名
   */
  onRenameColumn?: (oldName: string, newName: string) => void;
  /**
   * カラム削除確定時のコールバック。
   * @param columnName - 削除するカラム名
   * @param destColumn - タスクの移動先カラム名
   */
  onDeleteColumn?: (columnName: string, destColumn: string | undefined) => void;
  /** 完了カラムの一括アーカイブ確定時のコールバック（board 表示形態のみで有効） */
  onArchiveColumnTasks?: (columnName: string) => void;
  /**
   * タスク drop 時のコールバック。Provider 側で sync / async を吸収する。
   */
  onTaskDrop?: TaskDropHandler;
  /**
   * カラム並び替え drop 時のコールバック。Provider 側で sync / async を吸収する。
   */
  onColumnReorder?: ColumnReorderHandler;
  /**
   * settings → board ナビゲートでラベル絞り込みを 1 回だけ seed する初期ラベル名。
   * `useTaskFilter` の `useState` 初期値関数にだけ反映され、effect での setCriteria
   * 二重適用は行わない。BoardWorkspace は settings からの遷移時に必ず remount される
   * ため、この seed は遷移ごとに 1 回適用される。
   */
  initialLabelFilter?: string | null;
  /**
   * 初期ラベルフィルタが BoardWorkspace の mount 後に 1 回だけ通知される。
   * 親（App）はこのコールバックで `pendingLabelFilter` を null へ戻し、残留を防ぐ。
   */
  onLabelFilterApplied?: () => void;
  /** GUIDE.mdタブを選択したときの設定画面遷移。 */
  onGuideClick?: () => void;
  /** サブバーの表示密度トグル。 */
  onDensityToggle?: () => void;
  /** 現在の表示密度。 */
  density?: "comfortable" | "compact";
};

/**
 * タスクが持つラベルの和集合を昇順で返す（フィルタの選択肢に使う）。
 * @param tasks - 対象タスク一覧
 * @returns 重複を除いた昇順のラベル名配列
 */
const collectLabels = (tasks: Task[]): string[] => {
  const labels = new Set<string>();
  for (const task of tasks) {
    for (const label of task.labels) {
      labels.add(label);
    }
  }
  return Array.from(labels).sort();
};

/**
 * ボード領域のワークスペース。サブバー（ビュー切替）と横断フィルタを備え、
 * board / list / tree / calendar / roadmap の各ビューへ絞り込み済みタスクを供給する。
 * @param props - {@link BoardWorkspaceProps}
 * @returns ワークスペース要素
 */
export const BoardWorkspace = (props: BoardWorkspaceProps) => {
  const {
    tasks,
    columns,
    milestones,
    initialLabelFilter,
    onDensityToggle,
    density = "comfortable",
    onLabelFilterApplied,
    onGuideClick,
  } = props;
  const { viewMode, setViewMode } = useBoardViewMode();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const isFilterPanelUnavailable =
    viewMode === "calendar" || viewMode === "roadmap";
  const isFilterPanelVisible = isFilterOpen && !isFilterPanelUnavailable;
  useEffect(() => {
    if (!isFilterPanelUnavailable) {
      return;
    }
    setIsFilterOpen(false);
  }, [isFilterPanelUnavailable]);
  const viewTabs = useMemo(
    () => buildViewTabs(tasks.length, onGuideClick !== undefined),
    [tasks.length, onGuideClick],
  );

  const availableLabels = useMemo(() => collectLabels(tasks), [tasks]);
  const statuses = useMemo(
    () => columns.map((column) => column.name),
    [columns],
  );
  const milestoneNames = useMemo(
    () => (milestones ?? []).map((milestone) => milestone.name),
    [milestones],
  );

  // カラムのリネーム/削除やマイルストーン削除で選択肢が消えると、UI に出ない条件が
  // 「隠れフィルタ」として残り続ける。利用可能な選択肢を渡して render 中に間引く。
  const filterOptions = useMemo(
    () => ({ statuses, labels: availableLabels, milestoneNames }),
    [statuses, availableLabels, milestoneNames],
  );
  const initialLabels = useMemo(
    () =>
      initialLabelFilter !== null && initialLabelFilter !== undefined
        ? [initialLabelFilter]
        : undefined,
    [initialLabelFilter],
  );
  const { criteria, setCriteria, clear, filtered, isActive } = useTaskFilter(
    tasks,
    filterOptions,
    { initialLabels },
  );

  // mount 時に initialLabelFilter があれば 1 回だけ親へ「適用済み」を通知し、
  // App 側の pendingLabelFilter を null へ戻して残留を防ぐ。
  //
  // 依存配列を空にする理由（remount 前提）: 本コンポーネントは App.tsx の条件付き
  // レンダリングで settings 表示中は unmount され、settings→board 遷移で必ず remount
  // されるため、mount-once 通知だけで pendingLabelFilter のクリア責務を満たせる。
  // mount 後に initialLabelFilter / onLabelFilterApplied が props として変化することは
  // 設計上想定しない（mount 時の値だけが正解）。
  //
  // stale closure 対策: onLabelFilterApplied / initialLabelFilter は ref に同期させ、
  // mount-once effect の中から ref 経由で最新参照を読む。これにより親が
  // useCallback の依存を増やしたり、毎 render 新関数を渡しても安全に動作する。
  const onLabelFilterAppliedRef = useRef(onLabelFilterApplied);
  const initialLabelFilterRef = useRef(initialLabelFilter);
  onLabelFilterAppliedRef.current = onLabelFilterApplied;
  initialLabelFilterRef.current = initialLabelFilter;
  useEffect(() => {
    if (!initialLabelFilterRef.current) {
      return;
    }
    // React.StrictMode 下では mount→cleanup→再 mount が同サイクル内で走るため、
    // 同期で onLabelFilterApplied を呼ぶと 1 回目の cleanup 前に親 state が null になり、
    // 2 回目 mount の useTaskFilter init が seed を取りこぼす可能性がある。
    // setTimeout(0) で遅延し、StrictMode の 1 回目 cleanup で clearTimeout して
    // 2 回目 mount 側だけが最終的に通知を発火する形にする。
    const id = window.setTimeout(() => {
      onLabelFilterAppliedRef.current?.();
    }, 0);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  return (
    <div
      data-board-view={viewMode}
      className="flex h-full min-w-0 flex-1 flex-col"
    >
      <div className="contents print:hidden">
        <TabNav
          tabs={viewTabs}
          activeTabId={viewMode}
          idPrefix={VIEW_TAB_PREFIX}
          ariaLabel="ボードの表示形態"
          onSelect={(tabId) => {
            if (tabId === "guide") {
              onGuideClick?.();
              return;
            }
            setViewMode(tabId as BoardViewMode);
          }}
          trailing={
            <div
              data-board-trailing
              className="flex min-w-0 items-center gap-2"
            >
              <label className="flex h-7 min-w-[220px] max-w-[280px] items-center gap-1.5 rounded-md border border-border bg-bg px-2 text-xs text-text-dim focus-within:border-accent focus-within:bg-surface">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={criteria.keyword}
                  onChange={(event) =>
                    setCriteria({ ...criteria, keyword: event.target.value })
                  }
                  placeholder="タスクをフィルタ…"
                  aria-label="タスクをフィルタ"
                  data-testid="board-filter-search"
                  className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-text-dim"
                />
                <kbd className="font-mono text-[10px] text-text-dim">⌘K</kbd>
              </label>
              <button
                type="button"
                data-testid="board-filter-toggle"
                aria-controls={
                  isFilterPanelVisible ? "task-filter-panel" : undefined
                }
                aria-expanded={isFilterPanelVisible}
                onClick={() => setIsFilterOpen((open) => !open)}
                className={
                  isFilterPanelVisible || isActive
                    ? "spec-button border-accent text-foreground"
                    : "spec-button"
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M3 6h18M6 12h12M10 18h4" />
                </svg>
                フィルタ
                {isActive && (
                  <span className="font-mono text-[10px]">
                    {filtered.length}/{tasks.length}
                  </span>
                )}
              </button>
              {onDensityToggle && (
                <button
                  type="button"
                  data-testid="board-density-toggle"
                  aria-label={
                    density === "compact"
                      ? "表示密度を標準に戻す"
                      : "表示密度をコンパクトにする"
                  }
                  title="表示密度"
                  onClick={onDensityToggle}
                  className="spec-icon-button"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                </button>
              )}
            </div>
          }
        />
      </div>
      {isFilterPanelVisible && (
        <TaskFilterBar
          criteria={criteria}
          onChange={setCriteria}
          onClear={clear}
          availableLabels={availableLabels}
          statuses={statuses}
          milestones={milestones ?? []}
          isActive={isActive}
          filteredCount={filtered.length}
          totalCount={tasks.length}
          showSearch={false}
        />
      )}
      {/* 各タブの aria-controls が常に有効な id を指すよう、tabpanel 要素は全ビュー分を
          描画する。非アクティブは hidden で隠し、中身（ビュー本体）はアクティブ時のみ
          レンダーして無駄な走査・描画を避ける。 */}
      {viewTabs.map((tab) => {
        const isActiveTab = tab.id === viewMode;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={tabNavPanelId(VIEW_TAB_PREFIX, tab.id)}
            aria-labelledby={tabNavTabId(VIEW_TAB_PREFIX, tab.id)}
            hidden={!isActiveTab}
            className="min-h-0 flex-1 overflow-auto"
          >
            {isActiveTab && (
              <ActiveBoardView
                viewMode={viewMode}
                filtered={filtered}
                filterActive={isActive}
                workspace={props}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
