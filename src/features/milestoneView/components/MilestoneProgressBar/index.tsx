type MilestoneProgressBarProps = {
  /** done タスク件数 */
  done: number;
  /** 全タスク件数 */
  total: number;
  /** done / total。doneColumn 未解決 or 所属 0 件のとき undefined */
  ratio: number | undefined;
};

/**
 * 比率（0..1）を 0-100 のパーセント整数に丸める。
 * @param ratio - 0..1 の比率
 * @returns 0..100 の整数パーセント
 */
const toPercent = (ratio: number): number => Math.round(ratio * 100);

/**
 * 進捗バー + フッター（パーセント + 件数）の縦並びレイアウト。
 * ratio が undefined（doneColumn 未解決 or 件数 0）のときバーを描画せず、
 * フッターのみ表示する。design-source: `.ms-progress` / `.pf` 部。
 * @param props - {@link MilestoneProgressBarProps}
 * @returns 進捗バー要素
 */
export const MilestoneProgressBar = ({
  done,
  total,
  ratio,
}: MilestoneProgressBarProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      {ratio !== undefined ? (
        <div className="h-2 w-full overflow-hidden rounded bg-surface-muted">
          <div
            data-testid="milestone-progress-bar"
            className="h-2 rounded bg-[var(--color-ms-success)]"
            style={{ width: `${toPercent(ratio)}%` }}
          />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {ratio !== undefined ? (
          <span className="font-mono text-sm font-semibold text-foreground">
            {toPercent(ratio)}%
          </span>
        ) : null}
        <span className="font-mono text-xs text-muted">
          {done} / {total} 完了
        </span>
      </div>
    </div>
  );
};
