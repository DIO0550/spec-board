import type { MilestoneDefinition } from "@/domains/milestone";
import type { MilestoneProjection } from "@/domains/milestone-projection";
import { MilestoneCard } from "@/features/milestoneView/components/MilestoneCard";
import type { MilestoneDisplayStatus } from "@/features/milestoneView/lib/milestoneStatus";

type MilestoneListProps = {
  milestones: readonly MilestoneDefinition[];
  statusOf: (def: MilestoneDefinition) => MilestoneDisplayStatus;
  projectionOf: (def: MilestoneDefinition) => MilestoneProjection;
  showRatio: boolean;
  selectedName: string | undefined;
  onSelect: (def: MilestoneDefinition) => void;
  now?: Date;
};

/**
 * フィルタ済み一覧をOpen（overdue含む）/Closedに分けて表示する。
 * グループ内の順序は上位のsort結果を保持する。
 * @param props - {@link MilestoneListProps}
 * @returns グループ化した一覧
 */
export const MilestoneList = ({
  milestones,
  statusOf,
  projectionOf,
  showRatio,
  selectedName,
  onSelect,
  now,
}: MilestoneListProps) => {
  if (milestones.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted">
        条件に一致するマイルストーンがありません
      </p>
    );
  }

  const open = milestones.filter(
    (definition) => statusOf(definition) !== "closed",
  );
  const closed = milestones.filter(
    (definition) => statusOf(definition) === "closed",
  );

  return (
    <div className="flex flex-col gap-[22px]">
      {open.length > 0 && (
        <section data-testid="milestone-group-open">
          <header className="mb-2.5 flex items-center gap-2.5">
            <h3 className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.04em]">
              <span className="size-[7px] rounded-full bg-[var(--color-ms-success)]" />
              Open
            </h3>
            <span className="font-mono text-[11px] text-text-dim">
              {open.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </header>
          <ul className="flex flex-col gap-3">
            {open.map((definition) => (
              <li key={definition.name}>
                <MilestoneCard
                  def={definition}
                  status={statusOf(definition)}
                  projection={projectionOf(definition)}
                  showRatio={showRatio}
                  selected={selectedName === definition.name}
                  onSelect={() => onSelect(definition)}
                  now={now}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {closed.length > 0 && (
        <section data-testid="milestone-group-closed">
          <header className="mb-2.5 flex items-center gap-2.5">
            <h3 className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.04em]">
              <span className="size-[7px] rounded-full bg-text-dim" /> Closed
            </h3>
            <span className="font-mono text-[11px] text-text-dim">
              {closed.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </header>
          <ul className="flex flex-col gap-3">
            {closed.map((definition) => (
              <li key={definition.name}>
                <MilestoneCard
                  def={definition}
                  status="closed"
                  projection={projectionOf(definition)}
                  showRatio={showRatio}
                  selected={selectedName === definition.name}
                  onSelect={() => onSelect(definition)}
                  now={now}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
