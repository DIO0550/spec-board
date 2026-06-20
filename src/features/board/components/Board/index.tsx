import type { Column as ColumnType } from "@/types/column";
import type { Task } from "@/types/task";
import { AddColumnButton } from "../AddColumnButton";
import { BoardCardProvider, type TaskDropHandler } from "../BoardCardProvider";
import {
  BoardColumnProvider,
  type ColumnReorderHandler,
} from "../BoardColumnProvider";
import { Column } from "../Column";
import type { MilestonesByName } from "../TaskCard";

/** ボードの Props */
type BoardProps = {
  /** カラム定義の配列 */
  columns: ColumnType[];
  /** カラムへ表示するタスクの配列（絞り込み済みの表示用集合） */
  tasks: Task[];
  /**
   * 階層カウント（子孫数など）の解決に使う全タスク集合。絞り込みで tasks が減っても
   * 子孫カウントを正確に保つため、未絞り込みの全タスクを渡す。未指定なら tasks を使う。
   */
  allTasks?: Task[];
  /** 正規化済み Task.filePath → Task の lookup Map。Provider 経由で配布する。 */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** 完了カラム名 */
  doneColumn?: string;
  /** name → マイルストーン定義の Map（カードバッジ用） */
  milestonesByName?: MilestonesByName;
  /**
   * カード / カラムの DnD を無効化するか。フィルタ有効時など、表示集合（tasks）が全タスクと
   * 異なり並べ替えが cardOrder を壊しうる状況で true にする。
   */
  dndDisabled?: boolean;
  /** カラムの「+ 追加」ボタンクリック時のコールバック
   * @param columnName - 追加対象のカラム名
   */
  onAddTask: (columnName: string) => void;
  /**
   * タスクカードクリック時のコールバック
   * @param taskId - クリックされたタスクのID
   */
  onTaskClick?: (taskId: string) => void;
  /**
   * 新規カラム追加時のコールバック。
   * ボード右端の AddColumnButton から呼び出される。
   * 未指定の場合はカラム追加 UI を非表示にする。
   * @param columnName - 追加するカラム名（trim 済み、既存と非重複）
   */
  onAddColumn?: (columnName: string) => void;
  /**
   * カラム名リネーム確定時のコールバック。
   * 未指定の場合はカラム名編集 UI を無効化する。
   * @param oldName - 元のカラム名
   * @param newName - 新しいカラム名（trim 済み、既存と非重複）
   */
  onRenameColumn?: (oldName: string, newName: string) => void;
  /**
   * カラム削除確定時のコールバック。
   * 未指定の場合はカラム削除 UI を無効化する。
   * カラムが 1 つの場合は内部で削除操作を禁止する。
   * @param columnName - 削除するカラム名
   * @param destColumn - タスクの移動先カラム名。削除対象カラムにタスクが 0 件の場合は undefined
   */
  onDeleteColumn?: (columnName: string, destColumn: string | undefined) => void;
  /**
   * Board が drop を受けたら呼ぶ。App.tsx で useProject.moveTask に配線する。
   * Provider が sync / async どちらも await し、throw は内部で握る。
   */
  onTaskDrop?: TaskDropHandler;
  /**
   * Board が column の drop を受けたら呼ぶ。App.tsx で useProject.reorderColumns に配線する。
   * Provider が sync / async どちらも await し、throw は内部で握る。
   */
  onColumnReorder?: ColumnReorderHandler;
};

/**
 * カラム一覧を横並びで表示するボードコンテナ。
 * 派生計算（tasksByStatus / columnNames / hierarchyTasks など）は
 * すべて {@link BoardCardProvider} / {@link BoardColumnProvider} に閉じ込め、
 * Board 本体は Provider マウントとカラム配置のみを担う宣言的なコンポジション。
 *
 * @param props - {@link BoardProps}
 * @returns ボード要素
 */
export const Board = ({
  columns,
  tasks,
  allTasks,
  tasksByNormalizedPath,
  doneColumn,
  milestonesByName,
  dndDisabled = false,
  onAddTask,
  onTaskClick,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onTaskDrop,
  onColumnReorder,
}: BoardProps) => {
  return (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks ?? tasks}
      tasksByNormalizedPath={tasksByNormalizedPath ?? new Map()}
      milestonesByName={milestonesByName}
      doneColumn={doneColumn}
      dndDisabled={dndDisabled}
      onTaskDrop={onTaskDrop}
    >
      <BoardColumnProvider
        columns={columns}
        tasks={tasks}
        allTasks={allTasks}
        dndDisabled={dndDisabled}
        onColumnReorder={onColumnReorder}
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-1 gap-4 overflow-x-auto p-4">
            {[...columns]
              .sort((a, b) => a.order - b.order)
              .map((col, index) => (
                <Column
                  key={col.name}
                  name={col.name}
                  color={col.color}
                  order={index}
                  onAddClick={() => onAddTask(col.name)}
                  onTaskClick={onTaskClick}
                  onRename={
                    onRenameColumn
                      ? (newName) => onRenameColumn(col.name, newName)
                      : undefined
                  }
                  onDelete={
                    onDeleteColumn
                      ? (destColumn) => onDeleteColumn(col.name, destColumn)
                      : undefined
                  }
                  columnDraggable={columns.length > 1}
                />
              ))}
            {onAddColumn && <AddColumnButton onAdd={onAddColumn} />}
          </div>
        </div>
      </BoardColumnProvider>
    </BoardCardProvider>
  );
};
