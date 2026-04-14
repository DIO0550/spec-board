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
	/** サブIssue追加ボタン押下時のコールバック */
	onAddSubIssue: () => void;
};

/**
 * @param props - isDone: 完了かどうか
 * @returns ステータスアイコン要素
 */
function StatusIcon({ isDone }: { isDone: boolean }) {
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
}

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
	const percentage = Math.round((doneCount / total) * 100);

	return (
		<section data-testid="sub-issue-section" aria-label="サブIssue">
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-medium text-gray-700">サブIssue</h3>
				<button
					type="button"
					className="text-xs text-blue-600 hover:text-blue-800"
					data-testid="add-sub-issue-button"
					onClick={onAddSubIssue}
				>
					+ サブIssue 追加
				</button>
			</div>
			<div className="mb-2 flex items-center gap-2">
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
