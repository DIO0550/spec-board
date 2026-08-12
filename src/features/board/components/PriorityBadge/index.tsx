import type { Priority } from "@/domains/priority";

type PriorityBadgeProps = {
  priority: Priority | undefined;
};

// Legacy utility classes remain part of the DOM contract while the inline token
// supplies the compact dot colour required by the board design.
const priorityStyles: Record<Priority, string> = {
  High: "bg-red-100 text-red-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};

const priorityColors: Record<Priority, string> = {
  High: "var(--color-priority-high, #dc2626)",
  Medium: "var(--color-priority-medium, #d97706)",
  Low: "var(--color-priority-low, #2563eb)",
};

/**
 * @param props - {@link PriorityBadgeProps}
 * @returns 優先度を示す色付きドット。未設定時は null
 */
export const PriorityBadge = ({ priority }: PriorityBadgeProps) => {
  if (!priority) {
    return null;
  }

  return (
    <span
      role="img"
      aria-label={`優先度: ${priority}`}
      title={priority}
      className={`mt-[5px] inline-flex size-2 shrink-0 items-center rounded-full ${priorityStyles[priority]}`}
      style={{ backgroundColor: priorityColors[priority] }}
    >
      <span className="sr-only">{priority}</span>
    </span>
  );
};
