import type { TaskPathLookup } from "@/domains/task-path-lookup";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { Board } from "@/features/board/components/Board";
import type { TaskDropHandler } from "@/features/board/components/BoardCardProvider";
import type { ColumnReorderHandler } from "@/features/board/components/BoardColumnProvider";
import { BoardProviders } from "@/features/board/components/BoardProviders";
import type { MilestonesByName } from "@/features/board/components/TaskCard";
import type { Column as ColumnType } from "@/types/column";
import type { Task, TaskId } from "@/types/task";

/** BoardView の Props。board 描画に必要な最小集合を明示的に受ける。 */
type BoardViewProps = {
  /** カラム定義の配列（内部で order 昇順ソートする） */
  columns: ColumnType[];
  /** 絞り込み後の表示用タスク（BoardProviders の tasks に渡す） */
  filtered: Task[];
  /** 絞り込み前の全タスク（階層カウント用に allTasks へ渡す） */
  allTasks: Task[];
  /** 絞り込みが有効か。true のとき DnD を無効化する（dndDisabled へ伝播） */
  filterActive: boolean;
  /** 正規化済み Task.filePath → Task の lookup */
  tasksByNormalizedPath?: TaskPathLookup;
  /** name → マイルストーン定義の Map（カードバッジ用） */
  milestonesByName?: MilestonesByName;
  /** 完了カラム名 */
  doneColumn?: string;
  /** filePath -> projection（BE 集計）。BoardProviders へそのまま渡す。 */
  projections: TaskProjectionMap;
  /** タスク drop ハンドラ。Provider 側で sync / async を吸収する。 */
  onTaskDrop?: TaskDropHandler;
  /** カラム並び替えハンドラ。Provider 側で sync / async を吸収する。 */
  onColumnReorder?: ColumnReorderHandler;
  /**
   * カラムの「+ 追加」クリック時のコールバック。
   * @param columnName - 追加対象のカラム名
   */
  onAddTask: (columnName: string) => void;
  /**
   * タスククリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick: (taskId: TaskId) => void;
  /**
   * 新規カラム追加コールバック（undefined のとき AddColumn を出さない）。
   * @param columnName - 追加するカラム名
   */
  onAddColumn?: (columnName: string) => void;
  /**
   * カラム名リネームコールバック（undefined のとき rename UI を出さない）。
   * @param oldName - 元のカラム名
   * @param newName - 新しいカラム名
   */
  onRenameColumn?: (oldName: string, newName: string) => void;
  /**
   * カラム削除コールバック（undefined のとき delete UI を出さない）。
   * @param columnName - 削除するカラム名
   * @param destColumn - タスクの移動先カラム名
   */
  onDeleteColumn?: (columnName: string, destColumn: string | undefined) => void;
  /** 完了カラムの一括アーカイブ確定時のコールバック（Board.Column へ素通し） */
  onArchiveColumnTasks?: (columnName: string) => void;
};

/**
 * board 表示形態の描画を担う。カラムを order 昇順にソートして
 * Board.Column を生成する（ドラッグ可否は BoardColumnProvider が
 * columnDraggable として導出し Context で各 Column へ届く）。
 * onAddColumn があるときだけ Board.AddColumn を出す。
 * @param props - {@link BoardViewProps}
 * @returns board 描画要素
 */
export const BoardView = ({
  columns,
  filtered,
  allTasks,
  filterActive,
  tasksByNormalizedPath,
  milestonesByName,
  doneColumn,
  projections,
  onTaskDrop,
  onColumnReorder,
  onAddTask,
  onTaskClick,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onArchiveColumnTasks,
}: BoardViewProps) => {
  const ordered = [...columns].sort((a, b) => a.order - b.order);
  return (
    <BoardProviders
      columns={columns}
      tasks={filtered}
      allTasks={allTasks}
      tasksByNormalizedPath={tasksByNormalizedPath}
      milestonesByName={milestonesByName}
      doneColumn={doneColumn}
      projections={projections}
      dndDisabled={filterActive}
      onTaskDrop={onTaskDrop}
      onColumnReorder={onColumnReorder}
    >
      <Board>
        {ordered.map((col, index) => (
          <Board.Column
            key={col.name}
            name={col.name}
            color={col.color}
            order={index}
            wipLimit={col.wipLimit}
            onAddTask={onAddTask}
            onTaskClick={onTaskClick}
            onRenameColumn={onRenameColumn}
            onDeleteColumn={onDeleteColumn}
            onArchiveColumnTasks={onArchiveColumnTasks}
          />
        ))}
        {onAddColumn && <Board.AddColumn onAdd={onAddColumn} />}
      </Board>
    </BoardProviders>
  );
};
