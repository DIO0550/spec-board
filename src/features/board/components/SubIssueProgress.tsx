import { ProgressBar } from "../../../components/ProgressBar";
import { StatusIcon } from "../../../components/StatusIcon";
import type { Task } from "../../../types/task";

type SubIssueProgressProps = {
	childTasks: Task[];
	doneColumn: string;
};

/**
 * @param props - {@link SubIssueProgressProps}
 * @returns サブIssue進捗バーと子タスクリスト。子タスクが空の場合は null
 */
export function SubIssueProgress({
	childTasks,
	doneColumn,
}: SubIssueProgressProps) {
	if (childTasks.length === 0) {
		return null;
	}

	const total = childTasks.length;
	const doneCount = childTasks.filter((t) => t.status === doneColumn).length;

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
			<div className="mt-1">
				<ProgressBar doneCount={doneCount} total={total} />
			</div>
		</div>
	);
}
