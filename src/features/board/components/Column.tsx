import { useMemo } from "react";
import type { Task } from "../../../types/task";
import { ColumnHeader } from "./ColumnHeader";
import { TaskCard } from "./TaskCard";

/** 個別カラムの Props */
type ColumnProps = {
	/** ステータス名 */
	name: string;
	/** カラムに属するタスクの配列 */
	tasks: Task[];
	/** 全タスクの配列（子タスク解決用） */
	allTasks?: Task[];
	/** 完了カラム名 */
	doneColumn?: string;
	/** 「+ 追加」ボタンクリック時のコールバック */
	onAddClick: () => void;
	/**
	 * タスクカードクリック時のコールバック
	 * @param taskId - クリックされたタスクのID
	 */
	onTaskClick?: (taskId: string) => void;
	/**
	 * カラム名リネーム確定時のコールバック。
	 * 未指定の場合はヘッダー名編集 UI を無効化する。
	 * @param newName - 新しいカラム名（trim 済み、既存と非重複）
	 */
	onRename?: (newName: string) => void;
	/** 他カラム名の一覧（重複チェック用。自身は含まない） */
	existingColumnNames?: string[];
};

/**
 * ステータス別の個別カラムを表示する
 * @param props - {@link ColumnProps}
 * @returns カラム要素
 */
export function Column({
	name,
	tasks,
	allTasks = [],
	doneColumn,
	onAddClick,
	onTaskClick,
	onRename,
	existingColumnNames,
}: ColumnProps) {
	const tasksByFilePath = useMemo(
		() => new Map(allTasks.map((t) => [t.filePath, t])),
		[allTasks],
	);

	return (
		<section
			className="flex h-full w-72 min-w-72 flex-col rounded-lg bg-gray-50"
			aria-label={name}
		>
			<ColumnHeader
				name={name}
				taskCount={tasks.length}
				onAddClick={onAddClick}
				onRename={onRename}
				existingColumnNames={existingColumnNames}
			/>
			<ul className="flex-1 overflow-y-auto px-2 pb-2">
				{tasks.map((task) => {
					const childTasks = task.children
						.map((fp) => tasksByFilePath.get(fp))
						.filter((t): t is Task => t !== undefined);
					return (
						<li key={task.id} className="mb-2">
							<TaskCard
								task={task}
								childTasks={childTasks}
								doneColumn={doneColumn}
								onClick={onTaskClick}
							/>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
