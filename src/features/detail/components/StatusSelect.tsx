import type { Column } from "../../../types/task";

/** StatusSelect の Props */
type StatusSelectProps = {
	/** 現在のステータス値 */
	value: string;
	/** 選択肢となるカラム一覧 */
	columns: Column[];
	/**
	 * ステータス変更時のコールバック
	 * @param status - 選択されたステータス
	 */
	onChange: (status: string) => void;
};

/**
 * ステータスを変更するドロップダウン
 * @param props - {@link StatusSelectProps}
 * @returns セレクト要素
 */
export function StatusSelect({ value, columns, onChange }: StatusSelectProps) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm font-medium text-gray-500">ステータス</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 hover:border-blue-300 focus:border-blue-400 focus:outline-none"
				data-testid="status-select"
				aria-label="ステータス"
			>
				{columns.map((col) => (
					<option key={col.name} value={col.name}>
						{col.name}
					</option>
				))}
			</select>
		</div>
	);
}
