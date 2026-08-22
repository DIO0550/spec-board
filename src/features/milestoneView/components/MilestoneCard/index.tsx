import type { MilestoneDefinition } from "@/domains/milestone";
import { Milestone } from "@/domains/milestone";
import type { MilestoneProjection } from "@/domains/milestone-projection";
import { MilestoneCountdownBadge } from "@/features/milestoneView/components/MilestoneCountdownBadge";
import { MilestoneProgressBar } from "@/features/milestoneView/components/MilestoneProgressBar";
import { MilestoneStateBadge } from "@/features/milestoneView/components/MilestoneStateBadge";
import {
  formatDue,
  type MilestoneDisplayStatus,
  resolveCountdown,
} from "@/features/milestoneView/lib/milestoneStatus";

type MilestoneCardProps = {
  def: MilestoneDefinition;
  status: MilestoneDisplayStatus;
  projection: MilestoneProjection;
  showRatio: boolean;
  selected: boolean;
  /** カードを選択したときのcallback。 */
  onSelect: () => void;
  now?: Date;
};

/** 一覧のマイルストーンカード。 */
export const MilestoneCard = ({
  def,
  status,
  projection,
  showRatio,
  selected,
  onSelect,
  now,
}: MilestoneCardProps) => {
  const countdown = resolveCountdown(def, now);
  const title = Milestone.badgeLabel(def.name, def);
  const { done, total } = projection;
  const ratio = showRatio && total > 0 ? done / total : undefined;
  const dueLabel = formatDue(def.due);
  const isClosed = status === "closed";

  return (
    <button
      type="button"
      data-testid="milestone-view-row"
      data-status={status}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "group flex w-full flex-col overflow-hidden rounded-[10px] border bg-surface text-left shadow-sm transition-all",
        "hover:-translate-y-px hover:border-border-strong hover:shadow-md active:translate-y-0",
        selected
          ? "border-accent ring-[3px] ring-accent-soft"
          : "border-border",
        isClosed ? "opacity-80" : "",
      ].join(" ")}
    >
      <div className="flex w-full items-start gap-3 p-4 pb-3">
        <MilestoneStateBadge status={status} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={`truncate text-[15px] font-semibold ${isClosed ? "text-muted" : "text-foreground"}`}
            >
              {title}
            </span>
            {def.name !== title ? (
              <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-accent">
                {def.name}
              </span>
            ) : null}
          </div>
          {def.description ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted">
              {def.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {dueLabel ? (
            <span className="font-mono text-[11px] text-muted">{dueLabel}</span>
          ) : null}
          <MilestoneCountdownBadge countdown={countdown} />
        </div>
      </div>
      <div className="w-full px-4 pb-3">
        <MilestoneProgressBar done={done} total={total} ratio={ratio} />
      </div>
      <footer className="flex w-full items-center border-t border-border bg-surface-muted px-4 py-2 text-[10.5px] text-text-dim">
        <span className="font-mono">milestones.yml · {def.name}</span>
        <span className="ml-auto font-semibold text-muted transition group-hover:text-accent">
          詳細 →
        </span>
      </footer>
    </button>
  );
};
