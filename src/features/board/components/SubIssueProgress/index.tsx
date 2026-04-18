import type { Task } from "@/types/task";

type SubIssueProgressProps = {
	childTasks: Task[];
	doneColumn: string;
};

/**
 * @param props - isDone: 完了かどうか
 * @returns ステータスアイコン要素
 */
const StatusIcon = ({ isDone }: { isDone: boolean }) => {
	const label = isDone ? "完了" : "未完了";

	if (isDone) {
		return (
			<span className="text-green-600" role="img" aria-label={label}>
				✓
			</span>
		);
	}
	return (
		<span className="text-gray-400" role="img" aria-label={label}>
			○
		</span>
	);
};

/**
 * @param props - {@link SubIssueProgressProps}
 * @returns サブIssue進捗バーと子タスクリスト。子タスクが空の場合は null
 */
export const SubIssueProgress = ({
	childTasks,
	doneColumn,
}: SubIssueProgressProps) => {
	if (childTasks.length === 0) {
		return null;
	}

	const total = childTasks.length;
	const doneCount = childTasks.filter((t) => t.status === doneColumn).length;
	const percentage = Math.round((doneCount / total) * 100);

	return (
		<div className="mt-2">
			<details
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-gray-600 hover:text-gray-800 [&::-webkit-details-marker]:hidden">
					<span aria-hidden="true">▶</span>
					<span>
						サブIssue ({doneCount}/{total})
					</span>
				</summary>
				<ul className="mt-1 ml-4 space-y-0.5 text-xs text-gray-700">
					{childTasks.map((child) => (
						<li key={child.id} className="flex items-center gap-1.5">
							<StatusIcon isDone={child.status === doneColumn} />
							<span>{child.title || child.filePath}</span>
						</li>
					))}
				</ul>
			</details>
			<div className="mt-1 flex items-center gap-2">
				<div
					className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200"
					role="progressbar"
					aria-valuenow={percentage}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={`進捗 ${doneCount}/${total}`}
				>
					<div
						className="h-full rounded-full bg-green-500 transition-all"
						style={{ width: `${percentage}%` }}
					/>
				</div>
				<span className="text-xs text-gray-500">
					{doneCount}/{total}
				</span>
			</div>
		</div>
	);
};
