/** ProgressBar の Props */
type ProgressBarProps = {
	/** 完了数 */
	doneCount: number;
	/** 合計数 */
	total: number;
};

/**
 * @param props - {@link ProgressBarProps}
 * @returns 進捗バー要素
 */
export function ProgressBar({ doneCount, total }: ProgressBarProps) {
	const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;

	return (
		<div className="flex items-center gap-2">
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
	);
}
