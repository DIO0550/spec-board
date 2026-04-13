import type { Task } from "../../../types/task";

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
 * タスクカードを表示する
 * @param props - {@link TaskCardProps}
 * @returns カード要素
 */
export function TaskCard({ task, onClick }: TaskCardProps) {
	const displayTitle = task.title || task.filePath;

	if (!onClick) {
		return (
			<div className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm">
				<p className="text-sm text-gray-800">{displayTitle}</p>
			</div>
		);
	}

	return (
		<button
			type="button"
			className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-blue-300 hover:shadow-md"
			onClick={() => onClick(task.id)}
		>
			<p className="text-sm text-gray-800">{displayTitle}</p>
		</button>
	);
}
