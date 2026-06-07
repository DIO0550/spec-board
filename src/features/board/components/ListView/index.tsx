import { DueBadge } from "@/components/DueBadge";
import type { Task } from "@/types/task";

/** ListView の Props。 */
type ListViewProps = {
  /** 表示するタスク一覧（絞り込み済み） */
  tasks: Task[];
  /**
   * 行クリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick?: (taskId: string) => void;
};

/**
 * タスクをフラットな一覧（行）で表示するビュー。
 * status / priority / due / labels を 1 行にまとめ、行クリックで詳細を開く。
 * @param props - {@link ListViewProps}
 * @returns 一覧ビュー要素
 */
export const ListView = ({ tasks, onTaskClick }: ListViewProps) => {
  if (tasks.length === 0) {
    return <p className="p-4 text-sm text-muted">表示するタスクがありません</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            onClick={() => onTaskClick?.(task.id)}
            className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-muted"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {task.title}
            </span>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {task.status}
            </span>
            {task.priority && (
              <span className="shrink-0 text-xs text-muted">
                {task.priority}
              </span>
            )}
            <DueBadge due={task.due} />
            {task.labels.length > 0 && (
              <span className="shrink-0 truncate text-xs text-muted">
                {task.labels.join(" / ")}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
};
