import type { Priority } from "@/types/task";

/** PrioritySelect の Props */
type PrioritySelectProps = {
	/** 現在の優先度（未設定の場合は undefined） */
	value: Priority | undefined;
	/**
	 * 優先度変更時のコールバック
	 * @param priority - 選択された優先度（「なし」の場合は undefined）
	 */
	onChange: (priority: Priority | undefined) => void;
};

/** 選択可能な優先度一覧 */
const priorities: Priority[] = ["High", "Medium", "Low"];

/**
 * 優先度を変更するドロップダウン
 * @param props - {@link PrioritySelectProps}
 * @returns セレクト要素
 */
export const PrioritySelect = ({ value, onChange }: PrioritySelectProps) => {
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm font-medium text-gray-500">優先度</span>
			<select
				value={value ?? ""}
				onChange={(e) => {
					const selected = e.target.value;
					onChange(selected === "" ? undefined : (selected as Priority));
				}}
				className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 hover:border-blue-300 focus:border-blue-400 focus:outline-none"
				data-testid="priority-select"
				aria-label="優先度"
			>
				<option value="">なし</option>
				{priorities.map((p) => (
					<option key={p} value={p}>
						{p}
					</option>
				))}
			</select>
		</div>
	);
};
