import {
  displayStatusLabel,
  type MilestoneDisplayStatus,
} from "@/features/milestoneView/lib/milestoneStatus";

type MilestoneStateBadgeProps = {
  /** 表示ステータス（open/closed/overdue） */
  status: MilestoneDisplayStatus;
};

/** open: 緑● / closed: グレー✓ / overdue: 赤! のクラス対応表。 */
const STYLE_BY_STATUS: Record<
  MilestoneDisplayStatus,
  { bg: string; fg: string; border: string; icon: string }
> = {
  open: {
    bg: "bg-[var(--color-ms-success-bg)]",
    fg: "text-[var(--color-ms-success-fg)]",
    border: "border-[var(--color-ms-success-border)]",
    icon: "●",
  },
  closed: {
    bg: "bg-surface-muted",
    fg: "text-muted",
    border: "border-border",
    icon: "✓",
  },
  overdue: {
    bg: "bg-[var(--color-ms-danger-bg)]",
    fg: "text-[var(--color-ms-danger-fg)]",
    border: "border-[var(--color-ms-danger-border)]",
    icon: "!",
  },
};

/**
 * マイルストーンの表示ステータスを示す円形バッジ。
 * 仕様: docs/spec-board/milestone-view-spec.md（28px 円形バッジ）。
 * @param props - {@link MilestoneStateBadgeProps}
 * @returns ステータスバッジ要素
 */
export const MilestoneStateBadge = ({ status }: MilestoneStateBadgeProps) => {
  const s = STYLE_BY_STATUS[status];
  return (
    <span
      role="img"
      data-testid="milestone-state-badge"
      data-status={status}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${s.bg} ${s.fg} ${s.border}`}
      aria-label={displayStatusLabel(status)}
    >
      {s.icon}
    </span>
  );
};
