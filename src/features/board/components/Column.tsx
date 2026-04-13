import type { Task } from "../../../types/task";
import { ColumnHeader } from "./ColumnHeader";

/** 個別カラムの Props */
type ColumnProps = {
	/** ステータス名 */
	name: string;
	/** カラムに属するタスクの配列 */
	tasks: Task[];
	/** 「+ 追加」ボタンクリック時のコールバック */
	onAddClick: () => void;
};

/**
 * ステータス別の個別カラムを表示する
 * @param props - {@link ColumnProps}
 * @returns カラム要素
 */
export function Column({ name, tasks, onAddClick }: ColumnProps) {
	return (
		<section
			className="flex h-full w-72 min-w-72 flex-col rounded-lg bg-gray-50"
			aria-label={name}
		>
			<ColumnHeader
				name={name}
				taskCount={tasks.length}
				onAddClick={onAddClick}
			/>
			<ul className="flex-1 overflow-y-auto px-2 pb-2">
				{tasks.map((task) => (
					<li key={task.id} className="mb-2">
						<div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
							<p className="text-sm text-gray-800">{task.title}</p>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}
