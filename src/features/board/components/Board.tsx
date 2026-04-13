import type { Column as ColumnType, Task } from "../../../types/task";
import { Column } from "./Column";

/** ボードの Props */
type BoardProps = {
	/** カラム定義の配列 */
	columns: ColumnType[];
	/** タスクの配列 */
	tasks: Task[];
	/** カラムの「+ 追加」ボタンクリック時のコールバック
	 * @param columnName - 追加対象のカラム名
	 */
	onAddTask: (columnName: string) => void;
};

/**
 * カラム一覧を横並びで表示するボードコンテナ
 * @param props - {@link BoardProps}
 * @returns ボード要素
 */
export function Board({ columns, tasks, onAddTask }: BoardProps) {
	const sorted = [...columns].sort((a, b) => a.order - b.order);

	return (
		<div className="flex h-full gap-4 overflow-x-auto p-4">
			{sorted.map((col) => (
				<Column
					key={col.name}
					name={col.name}
					tasks={tasks.filter((t) => t.status === col.name)}
					onAddClick={() => onAddTask(col.name)}
				/>
			))}
		</div>
	);
}
