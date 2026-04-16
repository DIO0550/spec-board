import { useMemo } from "react";
import type { Column as ColumnType, Task } from "../../../types/task";
import { AddColumnButton } from "./AddColumnButton";
import { Column } from "./Column";

/** ボードの Props */
type BoardProps = {
	/** カラム定義の配列 */
	columns: ColumnType[];
	/** タスクの配列 */
	tasks: Task[];
	/** 完了カラム名 */
	doneColumn?: string;
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
};

/**
 * カラム一覧を横並びで表示するボードコンテナ
 * @param props - {@link BoardProps}
 * @returns ボード要素
 */
export function Board({
	columns,
	tasks,
	doneColumn,
	onAddTask,
	onTaskClick,
	onAddColumn,
	onRenameColumn,
}: BoardProps) {
	const sorted = useMemo(
		() => [...columns].sort((a, b) => a.order - b.order),
		[columns],
	);

	const tasksByStatus = useMemo(() => {
		const grouped: Record<string, Task[]> = {};
		for (const task of tasks) {
			if (!grouped[task.status]) {
				grouped[task.status] = [];
			}
			grouped[task.status].push(task);
		}
		return grouped;
	}, [tasks]);

	const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);

	return (
		<div className="flex h-full gap-4 overflow-x-auto p-4">
			{sorted.map((col) => (
				<Column
					key={col.name}
					name={col.name}
					tasks={tasksByStatus[col.name] ?? []}
					allTasks={tasks}
					doneColumn={doneColumn}
					onAddClick={() => onAddTask(col.name)}
					onTaskClick={onTaskClick}
					onRename={
						onRenameColumn
							? (newName) => onRenameColumn(col.name, newName)
							: undefined
					}
					existingColumnNames={columnNames.filter((n) => n !== col.name)}
				/>
			))}
			{onAddColumn && (
				<AddColumnButton
					existingColumnNames={columnNames}
					onAdd={onAddColumn}
				/>
			)}
		</div>
	);
}
