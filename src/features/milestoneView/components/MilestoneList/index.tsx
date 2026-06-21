import type { MilestoneDefinition } from "@/domains/milestone";
import { MilestoneCard } from "@/features/milestoneView/components/MilestoneCard";
import type { MilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import type { MilestoneDisplayStatus } from "@/features/milestoneView/lib/milestoneStatus";

type MilestoneListProps = {
  /** 表示するマイルストーン一覧（フィルタ済み・ソート済みを前提とする） */
  milestones: readonly MilestoneDefinition[];
  /**
   * 各マイルストーンの表示ステータスを返す。
   * @param def - マイルストーン定義
   * @returns 表示ステータス
   */
  statusOf: (def: MilestoneDefinition) => MilestoneDisplayStatus;
  /**
   * 各マイルストーンの進捗を返す。所属 0 件のときも undefined を返してよい。
   * @param def - マイルストーン定義
   * @returns 進捗、または undefined
   */
  progressOf: (def: MilestoneDefinition) => MilestoneProgress | undefined;
  /** 選択中のマイルストーン名（未選択なら undefined） */
  selectedName: string | undefined;
  /**
   * カードがクリックされた時に呼ばれる。
   * @param def - クリックされたマイルストーン定義
   */
  onSelect: (def: MilestoneDefinition) => void;
  /** 現在時刻（カウントダウン算出用・テスト差し替え用） */
  now?: Date;
};

/**
 * フィルタ・ソート済みのマイルストーン群を縦に並べる一覧ビュー。
 * グルーピングは行わず、上位の sortMilestones の結果をそのまま並べる
 * （design ではグループ見出しもあるが、ソート結果優先で簡素化）。
 *
 * 空（フィルタ結果ゼロ）のときは説明テキストを返す。
 * @param props - {@link MilestoneListProps}
 * @returns 一覧要素
 */
export const MilestoneList = ({
  milestones,
  statusOf,
  progressOf,
  selectedName,
  onSelect,
  now,
}: MilestoneListProps) => {
  if (milestones.length === 0) {
    return (
      <p className="rounded border border-dashed border-border bg-surface-muted p-6 text-center text-sm text-muted">
        条件に一致するマイルストーンがありません
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {milestones.map((def) => (
        <li key={def.name}>
          <MilestoneCard
            def={def}
            status={statusOf(def)}
            progress={progressOf(def)}
            selected={selectedName === def.name}
            onSelect={() => onSelect(def)}
            now={now}
          />
        </li>
      ))}
    </ul>
  );
};
