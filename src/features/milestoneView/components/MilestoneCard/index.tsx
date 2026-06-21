import type { MilestoneDefinition } from "@/domains/milestone";
import { Milestone } from "@/domains/milestone";
import { MilestoneCountdownBadge } from "@/features/milestoneView/components/MilestoneCountdownBadge";
import { MilestoneProgressBar } from "@/features/milestoneView/components/MilestoneProgressBar";
import { MilestoneStateBadge } from "@/features/milestoneView/components/MilestoneStateBadge";
import type { MilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import {
  formatDue,
  type MilestoneDisplayStatus,
  resolveCountdown,
} from "@/features/milestoneView/lib/milestoneStatus";

type MilestoneCardProps = {
  /** マスタ定義 */
  def: MilestoneDefinition;
  /** 派生表示ステータス */
  status: MilestoneDisplayStatus;
  /** 進捗（done/total/ratio）。所属 0 件のときも total=0 で受ける */
  progress: MilestoneProgress | undefined;
  /** 選択中かどうか（accent ハロー描画） */
  selected: boolean;
  /** カード全体クリック時に呼ばれる */
  onSelect: () => void;
  /** 現在時刻（カウントダウン算出用・テスト差し替え用） */
  now?: Date;
};

/**
 * 単一マイルストーンのカード。3 段構成（ヘッド: 状態+タイトル+期日 / ボディ: 進捗バー /
 * フッター: 所属件数の補足）。design-source: `.ms-card`。
 *
 * 既存テストの後方互換のため `data-testid="milestone-view-row"` を付ける。
 * @param props - {@link MilestoneCardProps}
 * @returns カード要素
 */
export const MilestoneCard = ({
  def,
  status,
  progress,
  selected,
  onSelect,
  now,
}: MilestoneCardProps) => {
  const countdown = resolveCountdown(def, now);
  const title = Milestone.badgeLabel(def.name, def);
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const ratio = progress?.ratio;
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
        "flex w-full flex-col gap-3 rounded-[10px] border bg-surface p-4 text-left transition shadow-sm",
        "hover:border-border",
        selected
          ? "border-accent ring-[3px] ring-accent-soft"
          : "border-border",
        isClosed ? "bg-surface-muted" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <MilestoneStateBadge status={status} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span
              className={`truncate text-[15px] font-semibold ${
                isClosed ? "text-muted" : "text-foreground"
              }`}
            >
              {title}
            </span>
            {def.name !== title ? (
              <span className="shrink-0 font-mono text-[10.5px] text-muted">
                {def.name}
              </span>
            ) : null}
          </div>
          {def.description !== undefined && def.description.length > 0 ? (
            <p className="line-clamp-1 text-xs text-muted">{def.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {(() => {
            // parseDue 検証を通った日付のみ YYYY-MM-DD で表示。
            // ISO datetime や不正値はカウントダウン側の "期日未設定" に整合させ表示しない。
            const dueLabel = formatDue(def.due);
            return dueLabel !== undefined ? (
              <span className="font-mono text-xs text-muted">{dueLabel}</span>
            ) : null;
          })()}
          <MilestoneCountdownBadge countdown={countdown} />
        </div>
      </div>
      <MilestoneProgressBar done={done} total={total} ratio={ratio} />
    </button>
  );
};
