import type { Task } from "@/types/task";
import { LabelTag } from "../LabelTag";
import { PriorityBadge } from "../PriorityBadge";
import { SubIssueProgress } from "../SubIssueProgress";

/** タスクカードの Props */
type TaskCardProps = {
	/** 表示するタスク */
	task: Task;
	/** 子タスクの配列（children を解決済み） */
	childTasks?: Task[];
	/** 完了カラム名 */
	doneColumn?: string;
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
const CardContent = ({
	task,
	childTasks = [],
	doneColumn = "Done",
}: {
	task: Task;
	childTasks?: Task[];
	doneColumn?: string;
}) => {
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
			<SubIssueProgress childTasks={childTasks} doneColumn={doneColumn} />
		</>
	);
};

/**
 * タスクカードを表示する
 * @param props - {@link TaskCardProps}
 * @returns カード要素
 */
export const TaskCard = ({
	task,
	childTasks,
	doneColumn,
	onClick,
}: TaskCardProps) => {
	if (!onClick) {
		return (
			<div className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm">
				<CardContent
					task={task}
					childTasks={childTasks}
					doneColumn={doneColumn}
				/>
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: CardContent may include interactive descendants such as details/summary, so a semantic <button> cannot be used as the card container
		<div
			role="button"
			tabIndex={0}
			className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-blue-300 hover:shadow-md"
			onClick={() => onClick(task.id)}
			onKeyDown={(e) => {
				if (e.currentTarget !== e.target) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick(task.id);
				}
			}}
		>
			<CardContent
				task={task}
				childTasks={childTasks}
				doneColumn={doneColumn}
			/>
		</div>
	);
};
