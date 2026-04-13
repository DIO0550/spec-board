import type { Task } from "../../../types/task";
import { LabelTag } from "./LabelTag";
import { PriorityBadge } from "./PriorityBadge";

/** タスクカードの Props */
type TaskCardProps = {
	/** 表示するタスク */
	task: Task;
	/**
	 * カードクリック時のコールバック
	 * @param taskId - クリックされたタスクのID
	 */
	onClick?: (taskId: string) => void;
};

/**
 * @param props - {@link TaskCardProps}
 * @returns カード要素
 */
function CardContent({ task }: { task: Task }) {
	const displayTitle = task.title || task.filePath;

	return (
		<>
			<div className="flex items-center gap-1.5">
				<PriorityBadge priority={task.priority} />
				<p className="text-sm text-gray-800">{displayTitle}</p>
			</div>
			{task.labels.length > 0 && (
				<div className="mt-1.5 flex flex-wrap gap-1">
					{task.labels.map((label) => (
						<LabelTag key={label} label={label} />
					))}
				</div>
			)}
		</>
	);
}

/**
 * タスクカードを表示する
 * @param props - {@link TaskCardProps}
 * @returns カード要素
 */
export function TaskCard({ task, onClick }: TaskCardProps) {
	if (!onClick) {
		return (
			<div className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm">
				<CardContent task={task} />
			</div>
		);
	}

	return (
		<button
			type="button"
			className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-blue-300 hover:shadow-md"
			onClick={() => onClick(task.id)}
		>
			<CardContent task={task} />
		</button>
	);
}
