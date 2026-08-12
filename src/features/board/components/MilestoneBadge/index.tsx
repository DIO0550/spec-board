import { Milestone } from "@/domains/milestone";
import type { MilestoneDefinition } from "@/lib/tauri";

type MilestoneBadgeProps = {
  /** frontmatter の milestone 値（参照キー） */
  name: string;
  /** 対応するマスタ定義。milestones.yml 未定義なら undefined（name 表示） */
  definition?: MilestoneDefinition;
};

/**
 * タスクのマイルストーンを表す単数バッジ。title があれば title、無ければ name を表示し、
 * due があれば付記する。labels の `LabelTag` と異なり map せず 1 件のみ表示する。
 * @param props - {@link MilestoneBadgeProps}
 * @returns マイルストーンバッジ要素
 */
export const MilestoneBadge = ({ name, definition }: MilestoneBadgeProps) => {
  const label = Milestone.badgeLabel(name, definition);
  const due = Milestone.dueLabel(definition);
  return (
    <span
      data-testid="milestone-badge"
      className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-[7px] py-px text-[10.5px] font-medium leading-[1.5] text-indigo-700"
    >
      <span className="milestone-badge__label">{label}</span>
      {due !== undefined ? (
        <span className="milestone-badge__due text-indigo-400">{due}</span>
      ) : null}
    </span>
  );
};
