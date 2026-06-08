import type { Task } from "@/types/task";

type SubIssueProgressProps = {
  /** 直下子（<details> 内の名前一覧用） */
  childTasks: readonly Task[];
  /** 全子孫の完了数（呼び出し側で `countSubIssueProgress` により集計済み） */
  done: number;
  /** 全子孫の総数（呼び出し側で `countSubIssueProgress` により集計済み） */
  total: number;
  /** 完了として扱うカラム名（子リストの完了アイコン判定用） */
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
 * @returns サブIssue進捗バーと直下子タスクリスト。総数（total）が 0 の場合は null。
 *   X/Y 数値表記はカードフッターへ集約したため、本コンポーネントはバーのみ表示し、
 *   進捗値は progressbar の aria 属性でスクリーンリーダーへ提供する。
 *   done/total は呼び出し側（TaskCard）が集計した値を受け取り、二重集計を避ける。
 */
export const SubIssueProgress = ({
  childTasks,
  done,
  total,
  doneColumn,
}: SubIssueProgressProps) => {
  if (total === 0) {
    return null;
  }

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
