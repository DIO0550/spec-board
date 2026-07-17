import type { Task } from "@/domains/task";
import { BoardView } from "@/features/board/components/BoardView";
import type { BoardWorkspaceProps } from "@/features/board/components/BoardWorkspace";
import { CalendarView } from "@/features/board/components/CalendarView";
import { ListView } from "@/features/board/components/ListView";
import { TreeView } from "@/features/board/components/TreeView";
import type { BoardViewMode } from "@/features/board/hooks/useBoardViewMode";

/** ActiveBoardView の Props。 */
type ActiveBoardViewProps = {
  /** 現在の表示形態 */
  viewMode: BoardViewMode;
  /** 絞り込み後のタスク */
  filtered: Task[];
  /**
   * 絞り込みが有効か。board 表示時に DnD を無効化し、隠れたカードを跨ぐ
   * 並べ替えで cardOrder が壊れるのを防ぐ。
   */
  filterActive: boolean;
  /** BoardWorkspace が受け取った全 props（board 表示時に BoardView へ委譲する） */
  workspace: BoardWorkspaceProps;
};

/**
 * 選択中の表示形態に対応するビューを描画する。board のみ BoardView へ委譲し、
 * 階層カウント用に絞り込み前の全タスクを allTasks として渡す。
 * @param props - {@link ActiveBoardViewProps}
 * @returns 表示形態に応じたビュー要素
 */
export const ActiveBoardView = ({
  viewMode,
  filtered,
  filterActive,
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
    <BoardView
      columns={workspace.columns}
      filtered={filtered}
      allTasks={workspace.tasks}
      filterActive={filterActive}
      tasksByNormalizedPath={workspace.tasksByNormalizedPath}
      milestonesByName={workspace.milestonesByName}
      doneColumn={workspace.doneColumn}
      onTaskDrop={workspace.onTaskDrop}
      onColumnReorder={workspace.onColumnReorder}
      onAddTask={workspace.onAddTask}
      onTaskClick={workspace.onTaskClick}
      onAddColumn={workspace.onAddColumn}
      onRenameColumn={workspace.onRenameColumn}
      onDeleteColumn={workspace.onDeleteColumn}
    />
  );
};
