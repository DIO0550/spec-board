type MilestoneProgressBarProps = {
  done: number;
  total: number;
  ratio: number | undefined;
};

const toPercent = (ratio: number): number =>
  Math.round(Math.min(1, Math.max(0, ratio)) * 100);

/** Done比率と未完了を3工程へ均等配分した4区分progress。 */
export const MilestoneProgressBar = ({
  done,
  total,
  ratio,
}: MilestoneProgressBarProps) => {
  const percent = ratio === undefined ? undefined : toPercent(ratio);
  const pendingPercent = percent === undefined ? 0 : (100 - percent) / 3;
  return (
    <div className="flex flex-col gap-2">
      {percent !== undefined ? (
        <div
          data-testid="milestone-progress-segments"
          className="flex h-2 w-full gap-px overflow-hidden rounded bg-surface-muted"
          role="progressbar"
          aria-label={`進捗 ${done}/${total}`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            data-testid="milestone-progress-bar"
            data-segment="done"
            className="h-full bg-[var(--color-ms-success)]"
            style={{ width: `${percent}%` }}
          />
          <span
            data-segment="review"
            className="h-full bg-[var(--color-ms-info)]"
            style={{ width: `${pendingPercent}%` }}
          />
          <span
            data-segment="in-progress"
            className="h-full bg-[var(--color-ms-inprog)]"
            style={{ width: `${pendingPercent}%` }}
          />
          <span
            data-segment="todo"
            className="h-full bg-[var(--color-ms-todo)]"
            style={{ width: `${pendingPercent}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {percent !== undefined ? (
          <span className="font-mono text-sm font-semibold text-foreground">
            {percent}%
          </span>
        ) : null}
        <span className="font-mono text-[11.5px] text-muted">
          {done} / {total} 完了
        </span>
        {percent !== undefined ? (
          <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-x-2 text-[10px] text-text-dim">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[var(--color-ms-success)]" />
              Done
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[var(--color-ms-info)]" />
              Review
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[var(--color-ms-inprog)]" />
              In progress
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[var(--color-ms-todo)]" />
              Todo
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
};
