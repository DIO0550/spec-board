import type { Task } from "@/types/task";

type SubIssueSectionProps = {
	/** 親タスク */
	parentTask: Task;
	/** 直接の子タスク一覧 */
	childTasks: Task[];
	/** 完了として扱うカラム名 */
	doneColumn: string;
	/**
	 * 「+ サブIssue 追加」ボタン押下時のコールバック。
	 * 親タスクのファイルパスを引数に受け取り、タスク作成フォームを開く想定。
	 * @param parentFilePath - 親タスクのファイルパス
	 */
	onAddSubIssue: (parentFilePath: string) => void;
	/**
	 * 子タスクをクリックした際のコールバック（任意）。
	 * @param childId - 対象の子タスクID
	 */
	onChildClick?: (childId: string) => void;
};

/**
 * 詳細パネル内のサブIssue セクション。
 * 子タスクの進捗と一覧、「+ サブIssue 追加」ボタンを表示する。
 *
 * @param props - {@link SubIssueSectionProps}
 * @returns サブIssue セクション要素
 */
export const SubIssueSection = ({
	parentTask,
	childTasks,
	doneColumn,
	onAddSubIssue,
	onChildClick,
}: SubIssueSectionProps) => {
	const total = childTasks.length;
	const doneCount = childTasks.filter((t) => t.status === doneColumn).length;
	const percentage = total === 0 ? 0 : Math.round((doneCount / total) * 100);

	return (
		<div data-testid="sub-issue-section">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium text-gray-500">
					サブIssue {total > 0 ? `(${doneCount}/${total})` : ""}
				</span>
			</div>
			{total > 0 && (
				<>
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
					<ul className="mb-2 space-y-1 text-sm text-gray-700">
						{childTasks.map((child) => {
							const isDone = child.status === doneColumn;
							const label = child.title || child.filePath;
							return (
								<li key={child.id}>
									<button
										type="button"
										className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent"
										disabled={onChildClick === undefined}
										onClick={() => onChildClick?.(child.id)}
										data-testid={`sub-issue-item-${child.id}`}
									>
										<span
											aria-hidden="true"
											className={isDone ? "text-green-600" : "text-gray-400"}
										>
											{isDone ? "✓" : "○"}
										</span>
										<span className="min-w-0 flex-1 truncate">{label}</span>
										<span className="text-xs text-gray-500">
											{child.status}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</>
			)}
			<button
				type="button"
				className="w-full rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:opacity-50"
				onClick={() => onAddSubIssue(parentTask.filePath)}
				data-testid="sub-issue-add-button"
			>
				+ サブIssue 追加
			</button>
		</div>
	);
};
