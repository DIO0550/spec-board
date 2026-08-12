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
  now,
}: MilestoneDetailSidebarProps) => {
  if (def === undefined || status === undefined) {
    return (
      <aside className="hidden min-h-64 max-h-full w-[360px] shrink-0 rounded-[10px] border border-dashed border-border bg-surface p-6 text-center text-sm text-muted min-[900px]:flex min-[900px]:items-center min-[900px]:justify-center">
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
    <aside className="hidden max-h-full w-[360px] shrink-0 flex-col gap-3 overflow-y-auto min-[900px]:flex">
      <section className="rounded-[10px] border border-border bg-surface p-4 shadow-sm">
        <header className="mb-4 flex items-start gap-3">
          <MilestoneStateBadge status={status} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold text-foreground">
              {title}
            </h3>
            <p className="font-mono text-[10.5px] text-muted">{def.name}</p>
          </div>
          <MilestoneCountdownBadge countdown={countdown} />
        </header>
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 border-t border-border pt-3 text-xs">
          <dt className="text-muted">状態</dt>
          <dd>{displayStatusLabel(status)}</dd>
          <dt className="text-muted">期日</dt>
          <dd className="font-mono">{due ?? "未設定"}</dd>
          <dt className="text-muted">進捗</dt>
          <dd className="font-mono">
            {projection
              ? `${projection.done} / ${projection.total}${showRatio ? ` (${percent}%)` : ""}`
              : "—"}
          </dd>
          <dt className="text-muted">ソース</dt>
          <dd className="font-mono text-[10.5px]">milestones.yml</dd>
        </dl>
        {def.description ? (
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">
            {def.description}
          </p>
        ) : null}
      </section>
      <section
        data-testid="milestone-burndown"
        className="rounded-[10px] border border-border bg-surface p-4 shadow-sm"
      >
        <header className="mb-3 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          <span>Burndown</span>
          <span className="font-mono normal-case">{percent}% complete</span>
        </header>
        <svg
          role="img"
          aria-label="バーンダウンチャート"
          viewBox="0 0 320 88"
          className="h-[88px] w-full overflow-visible"
        >
          <path
            d="M0 8 L320 80"
            fill="none"
            stroke="var(--color-border)"
            strokeDasharray="4 4"
          />
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
        </svg>
      </section>
      <section className="rounded-[10px] border border-border bg-surface p-4 shadow-sm">
        <header className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          所属タスク（{tasks.length}）
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
                  data-testid="milestone-sidebar-task"
                  className="flex items-center gap-2 border-t border-border py-2 first:border-t-0"
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
        <header className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          Activity
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
