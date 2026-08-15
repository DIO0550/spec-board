import type { MilestoneDefinition } from "@/domains/milestone";
import { Milestone } from "@/domains/milestone";
import type { MilestoneProjection } from "@/domains/milestone-projection";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import { MilestoneCountdownBadge } from "@/features/milestoneView/components/MilestoneCountdownBadge";
import { MilestoneStateBadge } from "@/features/milestoneView/components/MilestoneStateBadge";
import {
  displayStatusLabel,
  formatDue,
  type MilestoneDisplayStatus,
  resolveCountdown,
} from "@/features/milestoneView/lib/milestoneStatus";
import type { Task } from "@/types/task";

type MilestoneDetailSidebarProps = {
  def: MilestoneDefinition | undefined;
  status: MilestoneDisplayStatus | undefined;
  projection: MilestoneProjection | undefined;
  showRatio: boolean;
  tasks: readonly Task[];
  taskProjections: TaskProjectionMap;
  /** 所属タスク選択時のコールバック。 */
  onTaskClick?: (taskId: string) => void;
  now?: Date;
};

/** 選択中マイルストーンの概要、バーンダウン、タスク、アクティビティ。 */
export const MilestoneDetailSidebar = ({
  def,
  status,
  projection,
  showRatio,
  tasks,
  taskProjections,
  onTaskClick,
  now,
}: MilestoneDetailSidebarProps) => {
  if (def === undefined || status === undefined) {
    return (
      <aside className="hidden min-h-64 max-h-full w-[360px] shrink-0 rounded-[10px] border border-dashed border-border bg-surface p-6 text-center text-sm text-muted min-[1081px]:flex min-[1081px]:items-center min-[1081px]:justify-center">
        マイルストーンを選択すると詳細を表示します
      </aside>
    );
  }
  const title = Milestone.badgeLabel(def.name, def);
  const countdown = resolveCountdown(def, now);
  const due = formatDue(def.due);
  const percent =
    projection !== undefined && projection.total > 0
      ? Math.round((projection.done / projection.total) * 100)
      : 0;
  return (
    <aside className="hidden max-h-full w-[360px] shrink-0 flex-col gap-3.5 overflow-y-auto min-[1081px]:flex">
      <section className="overflow-hidden rounded-[10px] border border-border bg-surface shadow-sm">
        <header className="flex items-baseline gap-2 border-b border-border px-3.5 py-3 text-[11px] font-semibold text-muted">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold text-foreground">
              {title}
            </h3>
            <p className="font-mono text-[10.5px] text-muted">{def.name}</p>
          </div>
          <span className="font-mono text-[10.5px] font-medium text-text-dim">
            {def.name.startsWith("v") ? `${def.name}.0` : def.name}
          </span>
        </header>
        <div className="p-3.5">
          <dl className="grid grid-cols-[90px_1fr] items-center gap-x-3.5 gap-y-2 text-xs">
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
              状態
            </dt>
            <dd className="flex items-center gap-1.5">
              <MilestoneStateBadge status={status} />
              <span>{displayStatusLabel(status)}</span>
            </dd>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
              期日
            </dt>
            <dd className="flex items-center gap-2">
              <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11.5px]">
                {due ?? "未設定"}
              </code>
              <MilestoneCountdownBadge countdown={countdown} />
            </dd>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
              更新
            </dt>
            <dd>
              <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11.5px]">
                {def.updated ?? "—"}
              </code>
            </dd>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
              スラッグ
            </dt>
            <dd>
              <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11.5px]">
                {def.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")}
              </code>
            </dd>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
              ラベル
            </dt>
            <dd>
              <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted">
                milestone
              </span>
            </dd>
          </dl>
          {def.description ? (
            <p className="mt-3.5 border-t border-border pt-3.5 text-xs leading-relaxed text-foreground">
              {def.description}
            </p>
          ) : null}
        </div>
      </section>
      <section
        data-testid="milestone-burndown"
        className="rounded-[10px] border border-border bg-surface p-4 shadow-sm"
      >
        <header className="mb-3 flex items-center justify-between border-b border-border pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          <span>Burndown</span>
          {showRatio && (
            <span className="font-mono normal-case">{percent}% complete</span>
          )}
        </header>
        <svg
          role="img"
          aria-label="バーンダウンチャート"
          viewBox="0 0 320 140"
          className="h-[140px] w-full overflow-visible"
        >
          <path
            d="M0 8 L320 80"
            fill="none"
            stroke="var(--color-border)"
            strokeDasharray="4 4"
          />
          {showRatio && (
            <>
              <path
                d={`M0 8 C72 18, 128 34, ${192 + percent} ${50 + percent / 4} S280 76, 320 80`}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
              />
              <circle
                cx={Math.min(312, 192 + percent)}
                cy={Math.min(78, 50 + percent / 4)}
                r="4"
                fill="var(--color-accent)"
              />
            </>
          )}
        </svg>
      </section>
      <section className="rounded-[10px] border border-border bg-surface p-4 shadow-sm">
        <header className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          <span>タスク</span>
          <span className="ml-auto font-mono font-medium normal-case text-text-dim">
            {tasks.length}
          </span>
        </header>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted">タスクなし</p>
        ) : (
          <ul>
            {tasks.map((task) => {
              const isDone = TaskProjection.findByFilePath(
                taskProjections,
                task.filePath,
              ).isDone;
              return (
                <li
                  key={task.id}
                  className="border-t border-border first:border-t-0"
                >
                  <button
                    type="button"
                    data-testid="milestone-sidebar-task"
                    onClick={() => onTaskClick?.(task.id)}
                    className="flex w-full items-center gap-2 py-2 text-left hover:bg-surface-muted"
                  >
                    <span
                      className={`size-2 rounded-full ${isDone ? "bg-[var(--color-ms-success)]" : "bg-[var(--color-ms-todo)]"}`}
                    />
                    <span className="font-mono text-[10.5px] text-muted">
                      {task.id}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-xs ${isDone ? "text-muted line-through" : "text-foreground"}`}
                    >
                      {task.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section
        data-testid="milestone-sidebar-activity"
        className="rounded-[10px] border border-border bg-surface p-4 shadow-sm"
      >
        <header className="mb-2 border-b border-border pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          最近のアクティビティ
        </header>
        <p className="flex gap-2 text-xs text-muted">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-accent" />
          <span>
            <strong className="font-medium text-foreground">{def.name}</strong>{" "}
            の進捗を更新しました
          </span>
        </p>
      </section>
    </aside>
  );
};
