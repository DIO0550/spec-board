/** カラムヘッダーの Props */
type ColumnHeaderProps = {
	/** ステータス名 */
	name: string;
	/** カラム内のタスク件数 */
	taskCount: number;
	/** 「+ 追加」ボタンクリック時のコールバック */
	onAddClick: () => void;
};

/**
 * カラムヘッダーを表示する
 * @param props - {@link ColumnHeaderProps}
 * @returns カラムヘッダー要素
 */
export function ColumnHeader({
	name,
	taskCount,
	onAddClick,
}: ColumnHeaderProps) {
	return (
		<div className="flex items-center justify-between px-2 py-2">
			<div className="flex items-center gap-2">
				<h2 className="text-sm font-semibold text-gray-700">{name}</h2>
				<span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
					{taskCount}
				</span>
			</div>
			<button
				type="button"
				onClick={onAddClick}
				aria-label={`${name}に追加`}
				className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
			>
				+ 追加
			</button>
		</div>
	);
}
