import { type SubIssueCounts, TaskProjection } from "@/domains/task-projection";

/** `<details>` 内に並べる直下子 1 行分の表示データ。 */
export type SubIssueRow = {
  /** React key（子タスクの id） */
  readonly key: string;
  /** 表示ラベル（title、無ければ filePath） */
  readonly label: string;
  /** 完了状態（BE projection 由来） */
  readonly isDone: boolean;
};

type SubIssueProgressProps = {
  /** 直下子の表示行（呼び出し側が projection で解決済み） */
  childRows: readonly SubIssueRow[];
  /** 全子孫の完了数 / 総数（BE projection 由来） */
  counts: SubIssueCounts;
};

type StatusIconProps = {
  /** 完了かどうか */
  isDone: boolean;
};

/**
 * @param props - isDone: 完了かどうか
 * @returns ステータスアイコン要素
 */
const StatusIcon = ({ isDone }: StatusIconProps) => {
  const label = isDone ? "完了" : "未完了";

  if (isDone) {
    return (
      <span
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-green-100 text-[10px] font-bold text-green-700"
        role="img"
        aria-label={label}
      >
        ✓
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-border-strong text-[9px] text-muted"
      role="img"
      aria-label={label}
    >
      ○
    </span>
  );
};

/**
 * @param props - {@link SubIssueProgressProps}
 * @returns サブIssue進捗バーと直下子タスクリスト。総数（total）が 0 の場合は null。
 *   X/Y 数値表記はカードフッターへ集約したため、本コンポーネントはバーのみ表示し、
 *   進捗値は progressbar の aria 属性でスクリーンリーダーへ提供する。
 *   counts は BE projection 由来の値を受け取り、FE 側では再集計しない。
 */
export const SubIssueProgress = ({
  childRows,
  counts,
}: SubIssueProgressProps) => {
  // 孫だけを持つ親は childRows が空でも進捗バーを出すため、childRows.length ではなく
  // 全子孫の総数で判定する。
  if (counts.total === 0) {
    return null;
  }

  const percentage = TaskProjection.percentage(counts);

  return (
    <div className="mt-2.5">
      <details
        data-sub-issue
        className="group"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10.5px] font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="text-[8px] transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          <span>サブIssue</span>
        </summary>
        <ul className="ml-3.5 mt-1.5 space-y-1 text-[10.5px] leading-4 text-foreground">
          {childRows.map((row) => (
            <li key={row.key} className="flex min-w-0 items-center gap-1.5">
              <StatusIcon isDone={row.isDone} />
              <span className="min-w-0 truncate">{row.label}</span>
            </li>
          ))}
        </ul>
      </details>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full border border-border bg-surface-muted"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`進捗 ${counts.done}/${counts.total}`}
      >
        <div
          className="h-full rounded-full bg-green-500 transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
