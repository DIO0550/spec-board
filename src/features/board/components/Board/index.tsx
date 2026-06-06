import { useCallback, useMemo, useReducer, useRef } from "react";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Column as ColumnType } from "@/types/column";
import type { Task } from "@/types/task";
import { useMilestoneFilter } from "../../hooks/useMilestoneFilter";
import { AddColumnButton } from "../AddColumnButton";
import {
  Column,
  type ColumnDropParams,
  type ColumnTaskDropParams,
} from "../Column";
import { MilestoneFilter } from "../MilestoneFilter";
import type { MilestonesByName } from "../TaskCard";
import {
  ColumnDragState,
  type ColumnDragState as ColumnDragStateT,
} from "./columnDragState";
import { DragAction, dragReducer } from "./dragState";

/** ボードの Props */
type BoardProps = {
  /** カラム定義の配列 */
  columns: ColumnType[];
  /** タスクの配列 */
  tasks: Task[];
  /**
   * 「正規化済み Task.filePath → Task」の lookup Map。各 TaskCard の broken link 判定に使用する。
   * Board 自身では使用せず、Column へ pass-through する。
   */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** 完了カラム名 */
  doneColumn?: string;
  /**
   * name → マイルストーン定義の Map。Board 自身では使用せず、Column 経由で各 TaskCard の
   * バッジ（title / due 解決）へ pass-through する。
   */
  milestonesByName?: MilestonesByName;
  /**
   * 絞り込み UI の選択肢に並べるマイルストーン定義（registry 由来）。
   * 未指定 / 空のときは絞り込みツールバーを表示しない。
   */
  milestones?: readonly MilestoneDefinition[];
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
   * 同期 / 非同期どちらのハンドラも受け付ける。
   * @param params 移動パラメータ
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void union allows synchronous handlers without forcing consumers to wrap them in Promises
  onTaskDrop?: (params: ColumnTaskDropParams) => Promise<unknown> | void;
  /**
   * Board が column の drop を受けたら呼ぶ。App.tsx で useProject.reorderColumns に配線する。
   * 同期 / 非同期どちらのハンドラも受け付ける。
   * @param params 並び替えパラメータ
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void union allows synchronous handlers without forcing consumers to wrap them in Promises
  onColumnReorder?: (params: ColumnDropParams) => Promise<unknown> | void;
};

/**
 * カラム一覧を横並びで表示するボードコンテナ
 * @param props - {@link BoardProps}
 * @returns ボード要素
 */
export const Board = ({
  columns,
  tasks,
  tasksByNormalizedPath,
  doneColumn,
  milestonesByName,
  milestones,
  onAddTask,
  onTaskClick,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onTaskDrop,
  onColumnReorder,
}: BoardProps) => {
  const sorted = useMemo(
    () => [...columns].sort((a, b) => a.order - b.order),
    [columns],
  );

  // マイルストーン絞り込み。filtered をカラム表示に使い、子孫/子の解決には全 tasks を
  // 使う（allTasks へは絞り込み前の tasks を渡す）ため hierarchy のカウントは正確なまま。
  const { filter, setFilter, filtered } = useMilestoneFilter(tasks);
  const showMilestoneFilter = milestones !== undefined && milestones.length > 0;

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const task of filtered) {
      if (!grouped[task.status]) {
        grouped[task.status] = [];
      }
      grouped[task.status].push(task);
    }
    return grouped;
  }, [filtered]);

  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);

  const [dragState, dispatch] = useReducer(dragReducer, null);
  // hover state は初期実装では UI に未配線のため、Board の再レンダーを避けるべく
  // useRef に保持する。reducer は維持しつつ ref を mutate する形にし、将来
  // hover プレースホルダ表示を導入する際に useState / useReducer に差し戻す。
  const columnDragStateRef = useRef<ColumnDragStateT>(ColumnDragState.initial);

  const handleColumnDragStart = useCallback((columnName: string) => {
    columnDragStateRef.current = ColumnDragState.reducer(
      columnDragStateRef.current,
      { type: "start", fromColumnName: columnName },
    );
  }, []);

  const handleColumnDragEnd = useCallback(() => {
    columnDragStateRef.current = ColumnDragState.reducer(
      columnDragStateRef.current,
      { type: "end" },
    );
  }, []);

  const handleColumnHover = useCallback((columnName: string) => {
    columnDragStateRef.current = ColumnDragState.reducer(
      columnDragStateRef.current,
      { type: "hover", hoverColumnName: columnName },
    );
  }, []);

  const handleColumnDrop = useCallback(
    async (params: ColumnDropParams) => {
      try {
        await onColumnReorder?.(params);
      } catch {
        // unhandled rejection を防ぐため明示的に握る。エラー表示は App 側の責務。
      } finally {
        columnDragStateRef.current = ColumnDragState.reducer(
          columnDragStateRef.current,
          { type: "end" },
        );
      }
    },
    [onColumnReorder],
  );

  const handleDragStart = useCallback(
    (taskFilePath: string, fromColumn: string) => {
      dispatch(DragAction.start(taskFilePath, fromColumn));
    },
    [],
  );

  const handleDragHover = useCallback(
    (column: string | null, index: number | null) => {
      dispatch(DragAction.hover(column, index));
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    dispatch(DragAction.end());
  }, []);

  const handleTaskDrop = useCallback(
    async (params: ColumnTaskDropParams) => {
      try {
        await onTaskDrop?.(params);
      } catch {
        // unhandled rejection を防ぐため明示的に握る。
        // エラー表示は App 側 onTaskDrop の責務。
      } finally {
        dispatch(DragAction.end());
      }
    },
    [onTaskDrop],
  );

  return (
    <div className="flex h-full flex-col">
      {showMilestoneFilter && (
        <div className="flex items-center gap-2 px-4 pt-4">
          <MilestoneFilter
            milestones={milestones}
            filter={filter}
            onChange={setFilter}
          />
        </div>
      )}
      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {sorted.map((col) => (
          <Column
            key={col.name}
            name={col.name}
            tasks={tasksByStatus[col.name] ?? []}
            allTasks={tasks}
            tasksByNormalizedPath={tasksByNormalizedPath}
            doneColumn={doneColumn}
            milestonesByName={milestonesByName}
            onAddClick={() => onAddTask(col.name)}
            onTaskClick={onTaskClick}
            onRename={
              onRenameColumn
                ? (newName) => onRenameColumn(col.name, newName)
                : undefined
            }
            existingColumnNames={columnNames.filter((n) => n !== col.name)}
            onDelete={
              onDeleteColumn
                ? (destColumn) => onDeleteColumn(col.name, destColumn)
                : undefined
            }
            canDelete={columns.length > 1}
            dragState={dragState}
            onDragHover={handleDragHover}
            onTaskDrop={handleTaskDrop}
            onTaskDragStart={handleDragStart}
            onTaskDragEnd={handleDragEnd}
            columnDraggable={sorted.length > 1}
            onColumnDragStart={handleColumnDragStart}
            onColumnDragEnd={handleColumnDragEnd}
            onColumnHover={handleColumnHover}
            onColumnDrop={handleColumnDrop}
          />
        ))}
        {onAddColumn && (
          <AddColumnButton
            existingColumnNames={columnNames}
            onAdd={onAddColumn}
          />
        )}
      </div>
    </div>
  );
};
