import { useMemo } from "react";
import { type TabItem, TabNav, tabNavPanelId } from "@/components/TabNav";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Column as ColumnType } from "@/types/column";
import type { Task } from "@/types/task";
import {
  type BoardViewMode,
  useBoardViewMode,
} from "../../hooks/useBoardViewMode";
import { useTaskFilter } from "../../hooks/useTaskFilter";
import { Board } from "../Board";
import { CalendarView } from "../CalendarView";
import type { ColumnDropParams, ColumnTaskDropParams } from "../Column";
import { ListView } from "../ListView";
import type { MilestonesByName } from "../TaskCard";
import { TaskFilterBar } from "../TaskFilterBar";
import { TreeView } from "../TreeView";

/** ビュー切替タブの定義（表示形態 ID と表示名）。 */
const VIEW_TABS: readonly TabItem[] = [
  { id: "board", label: "ボード" },
  { id: "list", label: "リスト" },
  { id: "tree", label: "ツリー" },
  { id: "calendar", label: "カレンダー" },
];

/** サブバー / tabpanel の DOM id に使う接頭辞。 */
const VIEW_TAB_PREFIX = "board-view";

/** BoardWorkspace の Props。 */
type BoardWorkspaceProps = {
  /** カラム定義の配列 */
  columns: ColumnType[];
  /** 全タスク（絞り込み前） */
  tasks: Task[];
  /** 正規化済み Task.filePath → Task の lookup Map（broken link 判定用） */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** 完了カラム名 */
  doneColumn?: string;
  /** name → マイルストーン定義の Map（カードバッジ用） */
  milestonesByName?: MilestonesByName;
  /** 絞り込み UI に並べるマイルストーン定義 */
  milestones?: readonly MilestoneDefinition[];
  /**
   * カラムの「+ 追加」クリック時のコールバック。
   * @param columnName - 追加対象のカラム名
   */
  onAddTask: (columnName: string) => void;
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
  /**
   * タスク drop 時のコールバック。
   * @param params - 移動パラメータ
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void union allows synchronous handlers without forcing consumers to wrap them in Promises
  onTaskDrop?: (params: ColumnTaskDropParams) => Promise<unknown> | void;
  /**
   * カラム並び替え drop 時のコールバック。
   * @param params - 並び替えパラメータ
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void union allows synchronous handlers without forcing consumers to wrap them in Promises
  onColumnReorder?: (params: ColumnDropParams) => Promise<unknown> | void;
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

type ActiveBoardViewProps = {
  /** 現在の表示形態 */
  viewMode: BoardViewMode;
  /** 絞り込み後のタスク */
  filtered: Task[];
  /** BoardWorkspace が受け取った全 props（board 表示時に Board へ委譲する） */
  workspace: BoardWorkspaceProps;
};

/**
 * 選択中の表示形態に対応するビューを描画する。board のみ既存 Board へ委譲し、
 * 階層カウント用に絞り込み前の全タスクを allTasks として渡す。
 * @param props - {@link ActiveBoardViewProps}
 * @returns 表示形態に応じたビュー要素
 */
const ActiveBoardView = ({
  viewMode,
  filtered,
  workspace,
}: ActiveBoardViewProps) => {
  if (viewMode === "list") {
    return <ListView tasks={filtered} onTaskClick={workspace.onTaskClick} />;
  }
  if (viewMode === "tree") {
    return <TreeView tasks={filtered} onTaskClick={workspace.onTaskClick} />;
  }
  if (viewMode === "calendar") {
    return (
      <CalendarView tasks={filtered} onTaskClick={workspace.onTaskClick} />
    );
  }
  return (
    <Board
      columns={workspace.columns}
      tasks={filtered}
      allTasks={workspace.tasks}
      tasksByNormalizedPath={workspace.tasksByNormalizedPath}
      doneColumn={workspace.doneColumn}
      milestonesByName={workspace.milestonesByName}
      onAddTask={workspace.onAddTask}
      onTaskClick={workspace.onTaskClick}
      onAddColumn={workspace.onAddColumn}
      onRenameColumn={workspace.onRenameColumn}
      onDeleteColumn={workspace.onDeleteColumn}
      onTaskDrop={workspace.onTaskDrop}
      onColumnReorder={workspace.onColumnReorder}
    />
  );
};

/**
 * ボード領域のワークスペース。サブバー（ビュー切替）と横断フィルタを備え、
 * board / list / tree / calendar の各ビューへ絞り込み済みタスクを供給する。
 * @param props - {@link BoardWorkspaceProps}
 * @returns ワークスペース要素
 */
export const BoardWorkspace = (props: BoardWorkspaceProps) => {
  const { tasks, columns, milestones } = props;
  const { viewMode, setViewMode } = useBoardViewMode();
  const { criteria, setCriteria, clear, filtered, isActive } =
    useTaskFilter(tasks);

  const availableLabels = useMemo(() => collectLabels(tasks), [tasks]);
  const statuses = useMemo(
    () => columns.map((column) => column.name),
    [columns],
  );

  return (
    <div className="flex h-full flex-col">
      <TabNav
        tabs={VIEW_TABS}
        activeTabId={viewMode}
        idPrefix={VIEW_TAB_PREFIX}
        ariaLabel="ボードの表示形態"
        onSelect={(tabId) => setViewMode(tabId as BoardViewMode)}
      />
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
      />
      <div
        role="tabpanel"
        id={tabNavPanelId(VIEW_TAB_PREFIX, viewMode)}
        className="min-h-0 flex-1 overflow-auto"
      >
        <ActiveBoardView
          viewMode={viewMode}
          filtered={filtered}
          workspace={props}
        />
      </div>
    </div>
  );
};
