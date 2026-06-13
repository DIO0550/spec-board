import type { MilestoneDefinition } from "@/lib/tauri";
import type { MilestoneFilter as MilestoneFilterValue } from "../../lib/applyTaskFilter";

type MilestoneFilterProps = {
  /** 選択肢として並べるマイルストーン定義（registry 由来） */
  milestones: readonly MilestoneDefinition[];
  /** 現在のフィルタ */
  filter: MilestoneFilterValue;
  /**
   * フィルタ変更ハンドラ。
   * @param next - 新しいフィルタ
   */
  onChange: (next: MilestoneFilterValue) => void;
};

const ALL_VALUE = "all";
const UNASSIGNED_VALUE = "unassigned";
// milestone 名は自由文字列のため、制御用 option 値（all / unassigned）と衝突しないよう
// 専用 prefix を付けてエンコードする。"milestone:" で始まる名前も prefix 込みで一意になる。
const MILESTONE_PREFIX = "milestone:";

/**
 * select の選択値を MilestoneFilter に変換する。
 * @param value - select の value
 * @returns 対応するフィルタ
 */
const toFilter = (value: string): MilestoneFilterValue => {
  if (value === ALL_VALUE) {
    return { kind: "all" };
  }
  if (value === UNASSIGNED_VALUE) {
    return { kind: "unassigned" };
  }
  return { kind: "milestone", name: value.slice(MILESTONE_PREFIX.length) };
};

/**
 * 現在のフィルタを select の value に変換する。
 * @param filter - 現在のフィルタ
 * @returns select の value
 */
const toValue = (filter: MilestoneFilterValue): string => {
  if (filter.kind === "all") {
    return ALL_VALUE;
  }
  if (filter.kind === "unassigned") {
    return UNASSIGNED_VALUE;
  }
  return `${MILESTONE_PREFIX}${filter.name}`;
};

/**
 * ボードのマイルストーンフィルタ UI（全件 / 未割当 / 各マイルストーン）。
 * 選択状態は呼び出し側が保持する。
 * @param props - {@link MilestoneFilterProps}
 * @returns フィルタ select 要素
 */
export const MilestoneFilter = ({
  milestones,
  filter,
  onChange,
}: MilestoneFilterProps) => {
  return (
    <select
      aria-label="マイルストーンで絞り込み"
      value={toValue(filter)}
      onChange={(e) => onChange(toFilter(e.target.value))}
      className="rounded border px-2 py-1 text-sm"
    >
      <option value={ALL_VALUE}>すべてのマイルストーン</option>
      <option value={UNASSIGNED_VALUE}>未割当</option>
      {milestones.map((m) => (
        <option key={m.name} value={`${MILESTONE_PREFIX}${m.name}`}>
          {m.title ?? m.name}
        </option>
      ))}
    </select>
  );
};
