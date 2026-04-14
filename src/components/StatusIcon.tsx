/** ステータスアイコンの Props */
type StatusIconProps = {
	/** 完了かどうか */
	isDone: boolean;
};

/**
 * @param props - {@link StatusIconProps}
 * @returns ステータスアイコン要素
 */
export function StatusIcon({ isDone }: StatusIconProps) {
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
