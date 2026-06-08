import { TaskHierarchy } from "@/domains/task-hierarchy";
import type { Task } from "@/types/task";

type SubIssueProgressProps = {
  /** 直下子（<details> 内の名前一覧用） */
  childTasks: readonly Task[];
  /** 全子孫（進捗バーの算出元） */
  descendantTasks: readonly Task[];
  /** 完了として扱うカラム名 */
  doneColumn: string;
};

/**
 * @param props - isDone: 完了かどうか
 * @returns ステータスアイコン要素
 */
const StatusIcon = ({ isDone }: { isDone: boolean }) => {
  const label = isDone ? "完了" : "未完了";

  if (isDone) {
    return (
      <span className="text-green-600" role="img" aria-label={label}>
        ✓
      </span>
    );
  }
  return (
    <span className="text-muted" role="img" aria-label={label}>
      ○
    </span>
  );
};

/**
 * @param props - {@link SubIssueProgressProps}
 * @returns サブIssue進捗バーと直下子タスクリスト。子孫（descendantTasks）が空の場合は null。
 *   X/Y 数値表記はカードフッターへ集約したため、本コンポーネントはバーのみ表示し、
 *   進捗値は progressbar の aria 属性でスクリーンリーダーへ提供する。
 */
export const SubIssueProgress = ({
  childTasks,
  descendantTasks,
  doneColumn,
}: SubIssueProgressProps) => {
  if (descendantTasks.length === 0) {
    return null;
  }

  const { done, total } = TaskHierarchy.countSubIssueProgress(
    descendantTasks,
    doneColumn,
  );
  const percentage = Math.round((done / total) * 100);

  return (
    <div className="mt-2">
      <details
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true">▶</span>
          <span>サブIssue</span>
        </summary>
        <ul className="mt-1 ml-4 space-y-0.5 text-xs text-foreground">
          {childTasks.map((child) => (
            <li key={child.id} className="flex items-center gap-1.5">
              <StatusIcon isDone={child.status === doneColumn} />
              <span>{child.title || child.filePath}</span>
            </li>
          ))}
        </ul>
      </details>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`進捗 ${done}/${total}`}
      >
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
