import type { MilestoneDefinition } from "@/domains/milestone";
import { Milestone } from "@/domains/milestone";
import type { MilestoneDisplayStatus } from "@/features/milestoneView/lib/milestoneStatus";
import { computeRoadmapLayout } from "@/features/milestoneView/lib/roadmapLayout";

type MilestoneRoadmapProps = {
  /** 表示するマイルストーン一覧（フィルタ済み・ソート済みを前提とする） */
  milestones: readonly MilestoneDefinition[];
  /** 選択中のマイルストーン名（未選択なら undefined） */
  selectedName: string | undefined;
  /**
   * バーがクリックされた時に呼ばれる。
   * @param def - クリックされたマイルストーン定義
   */
  onSelect: (def: MilestoneDefinition) => void;
  /** 現在時刻（基準月決定・今日マーカー用・テスト差し替え用） */
  now?: Date;
};

/** ステータス別バー塗り色クラス。 */
const BAR_COLOR_BY_STATUS: Record<MilestoneDisplayStatus, string> = {
  open: "bg-[var(--color-ms-success)]",
  closed: "bg-[var(--color-ms-todo)]",
  overdue: "bg-[var(--color-ms-danger)]",
};

/**
 * 簡易ロードマップ（ガントチャート風）。今月起点に 8 か月分を横に並べ、各マイルストーンの
 * 期日付近に色付きバーを配置する。due 未設定のマイルストーンは描画対象外。
 * design-source: `.roadmap` / `.roadmap-row`。
 * @param props - {@link MilestoneRoadmapProps}
 * @returns ロードマップ要素
 */
export const MilestoneRoadmap = ({
  milestones,
  selectedName,
  onSelect,
  now,
}: MilestoneRoadmapProps) => {
  const layout = computeRoadmapLayout(milestones, now);

  if (layout.rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-border bg-surface-muted p-6 text-center text-sm text-muted">
        期日が設定されたマイルストーンがありません
      </p>
    );
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          今月から {layout.monthLabels.length} か月のロードマップ
        </h3>
        <span className="font-mono text-[11px] text-muted">
          basis: milestones.yml
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* グリッド全体（ヘッダ + 全行）を relative にし、月軸のトラック領域
              （label 列の右側）に「今日」の縦線を全行をまたいでオーバーレイ表示する。 */}
          <div className="relative">
            <div className="mb-5 grid grid-cols-[180px_1fr] items-center gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                マイルストーン
              </div>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${layout.monthLabels.length}, 1fr)`,
                }}
              >
                {layout.monthLabels.map((m) => (
                  <div
                    key={m}
                    className="border-l border-border px-2 font-mono text-[11px] text-muted"
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>

            <ul className="flex flex-col gap-2">
              {layout.rows.map((row) => {
                const title = Milestone.badgeLabel(row.def.name, row.def);
                const selected = selectedName === row.def.name;
                return (
                  <li
                    key={row.def.name}
                    className="grid grid-cols-[180px_1fr] items-center gap-2"
                  >
                    <div className="flex flex-col">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {title}
                      </span>
                      {row.def.due !== undefined ? (
                        <span className="font-mono text-[10.5px] text-muted">
                          {row.def.due}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative h-11 rounded border border-border bg-surface-muted">
                      <button
                        type="button"
                        data-testid="milestone-roadmap-bar"
                        data-name={row.def.name}
                        data-status={row.status}
                        aria-pressed={selected}
                        onClick={() => onSelect(row.def)}
                        style={{
                          left: `${row.leftPercent}%`,
                          width: `${row.widthPercent}%`,
                        }}
                        className={[
                          "absolute top-1.5 bottom-1.5 flex items-center justify-between gap-2 rounded-md px-2 text-[11px] font-medium text-white shadow-sm",
                          BAR_COLOR_BY_STATUS[row.status],
                          selected ? "ring-[3px] ring-accent-soft" : "",
                        ].join(" ")}
                      >
                        {/* flex 親内で truncate を効かせるには min-w-0 + flex-1 が必要
                            （子要素の min-width: auto を解除しないと省略表示が効かない） */}
                        <span className="min-w-0 flex-1 truncate">{title}</span>
                        {row.def.due !== undefined ? (
                          <span className="shrink-0 font-mono text-[10px] opacity-80">
                            {row.def.due}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* 「今日」縦線オーバーレイ。label 列 (180px + gap 8px) を除いたトラック領域に
                かぶせ、ヘッダから最下行までを 1 本の縦線で貫く。pointer-events-none で
                バーのクリックを邪魔しない。 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 right-0"
              style={{ left: "calc(180px + 0.5rem)" }}
            >
              <div
                data-testid="milestone-roadmap-today"
                className="absolute top-0 bottom-0 w-px bg-[var(--color-ms-danger)]"
                style={{ left: `${layout.todayPercent}%` }}
              />
              {/* ヘッダ (text-[11px] ≈ 16px) + mb-5 (20px) の領域内、
                  ヘッダ末端と最初のバー行の境目あたりに浮かせる。
                  surface 背景 + danger 色の枠線/文字でカードから浮き上がり、
                  月軸ラベルと多少重なっても可読性を確保する。 */}
              <span
                className="absolute -translate-x-1/2 rounded bg-surface px-1.5 text-[9px] font-mono leading-none whitespace-nowrap text-[var(--color-ms-danger-fg)] border border-[var(--color-ms-danger-border)] py-0.5"
                style={{
                  top: "20px",
                  left: `${layout.todayPercent}%`,
                }}
              >
                今日
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
