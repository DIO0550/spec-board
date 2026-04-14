import { ProgressBar } from "../../../components/ProgressBar";
import { StatusIcon } from "../../../components/StatusIcon";
import type { Task } from "../../../types/task";

/** SubIssueSection の Props */
type SubIssueSectionProps = {
	/** 子タスクの配列 */
	childTasks: Task[];
	/** 完了カラム名 */
	doneColumn: string;
	/**
	 * タスク選択時のコールバック
	 * @param taskId - 選択されたタスクのID
	 */
	onTaskSelect: (taskId: string) => void;
	/** サブIssue追加ボタン押下時のコールバック（未指定時はボタン非表示） */
	onAddSubIssue?: () => void;
};

/**
 * サブIssueセクション（進捗バー + 子タスク一覧）
 * @param props - {@link SubIssueSectionProps}
 * @returns セクション要素。子タスクが空の場合は null
 */
export function SubIssueSection({
	childTasks,
	doneColumn,
	onTaskSelect,
	onAddSubIssue,
}: SubIssueSectionProps) {
	if (childTasks.length === 0) {
		return null;
	}

	const total = childTasks.length;
	const doneCount = childTasks.filter((t) => t.status === doneColumn).length;

	return (
		<section data-testid="sub-issue-section" aria-label="サブIssue">
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-medium text-gray-700">サブIssue</h3>
				{onAddSubIssue && (
					<button
						type="button"
						className="text-xs text-blue-600 hover:text-blue-800"
						data-testid="add-sub-issue-button"
						onClick={onAddSubIssue}
					>
						+ サブIssue 追加
					</button>
				)}
			</div>
			<div className="mb-2">
				<ProgressBar doneCount={doneCount} total={total} />
			</div>
			<ul className="space-y-1">
				{childTasks.map((child) => (
					<li key={child.id}>
						<button
							type="button"
							className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
							onClick={() => onTaskSelect(child.id)}
						>
							<StatusIcon isDone={child.status === doneColumn} />
							<span>{child.title || child.filePath}</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
