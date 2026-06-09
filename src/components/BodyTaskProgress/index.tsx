type BodyTaskProgressProps = {
  /** checked 状態の task 項目数 */
  done: number;
  /** task 項目の総数（plain 項目は含まない） */
  total: number;
};

const PERCENT_MAX = 100;

/**
 * 本文タスクリストの完了率バー。子タスク status 集計のサブIssue進捗とは別概念で、
 * 本文の checkbox 完了率を表す。`total` が 0 のときは null。
 *
 * @param props - {@link BodyTaskProgressProps}
 * @returns 進捗バー要素、または total=0 のとき null
 */
export const BodyTaskProgress = ({ done, total }: BodyTaskProgressProps) => {
  if (total === 0) {
    return null;
  }
  const percentage = Math.round((done / total) * PERCENT_MAX);
  return (
    <div className="mb-1 flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={PERCENT_MAX}
        aria-label={`進捗 ${done}/${total}`}
      >
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-muted">
        {done}/{total}
      </span>
    </div>
  );
};
