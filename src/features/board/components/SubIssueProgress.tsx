import { useState } from "react";
import type { Task } from "../../../types/task";

type SubIssueProgressProps = {
	childTasks: Task[];
	doneColumn: string;
};

/**
 * @param props - isDone: 完了かどうか
 * @returns ステータスアイコン要素
 */
function StatusIcon({ isDone }: { isDone: boolean }) {
	if (isDone) {
		return <span className="text-green-600">✓</span>;
	}
	return <span className="text-gray-400">○</span>;
}

/**
 * @param props - {@link SubIssueProgressProps}
 * @returns サブIssue進捗バーと子タスクリスト。子タスクが空の場合は null
 */
export function SubIssueProgress({
	childTasks,
	doneColumn,
}: SubIssueProgressProps) {
	const [expanded, setExpanded] = useState(false);

	if (childTasks.length === 0) {
		return null;
	}

	const total = childTasks.length;
	const doneCount = childTasks.filter((t) => t.status === doneColumn).length;
	const percentage = Math.round((doneCount / total) * 100);

	return (
		<div className="mt-2">
			<button
				type="button"
				className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800"
				onClick={(e) => {
					e.stopPropagation();
					setExpanded((prev) => !prev);
				}}
				aria-expanded={expanded}
				aria-label={`サブIssue ${doneCount}/${total}`}
			>
				<span
					className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}
				>
					▶
				</span>
				<span>
					サブIssue ({doneCount}/{total})
				</span>
			</button>
			{expanded && (
				<ul className="mt-1 ml-4 space-y-0.5 text-xs text-gray-700">
					{childTasks.map((child) => (
						<li key={child.id} className="flex items-center gap-1.5">
							<StatusIcon isDone={child.status === doneColumn} />
							<span>{child.title || child.filePath}</span>
						</li>
					))}
				</ul>
			)}
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
}
