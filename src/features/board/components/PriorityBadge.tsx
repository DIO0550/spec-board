import type { Priority } from "../../../types/task";

type PriorityBadgeProps = {
	priority: Priority | undefined;
};

const priorityStyles: Record<Priority, string> = {
	High: "bg-red-100 text-red-800",
	Medium: "bg-yellow-100 text-yellow-800",
	Low: "bg-blue-100 text-blue-800",
};

/**
 * @param props - {@link PriorityBadgeProps}
 * @returns 優先度バッジ要素。未設定時は null
 */
export function PriorityBadge({ priority }: PriorityBadgeProps) {
	if (!priority) {
		return null;
	}

	return (
		<span
			className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${priorityStyles[priority]}`}
		>
			{priority}
		</span>
	);
}
