import type {
  MilestoneCountdown,
  MilestoneCountdownKind,
} from "@/features/milestoneView/lib/milestoneStatus";

type MilestoneCountdownBadgeProps = {
  /** カウントダウン情報（kind + label） */
  countdown: MilestoneCountdown;
};

/** kind ごとの配色クラス。design `.ms-countdown` の 4 系統に対応する。 */
const STYLE_BY_KIND: Record<MilestoneCountdownKind, string> = {
  overdue:
    "bg-[var(--color-ms-danger-bg)] text-[var(--color-ms-danger-fg)] border-[var(--color-ms-danger-border)]",
  soon: "bg-[var(--color-ms-warn-bg)] text-[var(--color-ms-warn-fg)] border-transparent",
  future: "bg-panel-2 text-text-dim border-border",
  done: "bg-[var(--color-ms-success-bg)] text-[var(--color-ms-success-fg)] border-[var(--color-ms-success-border)]",
  none: "bg-panel-2 text-text-dim border-border",
};

/**
 * 期日カウントダウンのピル形バッジ。design-source: `.ms-countdown`。
 * @param props - {@link MilestoneCountdownBadgeProps}
 * @returns バッジ要素
 */
export const MilestoneCountdownBadge = ({
  countdown,
}: MilestoneCountdownBadgeProps) => {
  return (
    <span
      data-testid="milestone-countdown"
      data-kind={countdown.kind}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs ${STYLE_BY_KIND[countdown.kind]}`}
    >
      {countdown.label}
    </span>
  );
};
