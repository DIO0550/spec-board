import type { MilestoneDefinition } from "@/domains/milestone";
import type { MilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import {
  dueSortKey,
  resolveDisplayStatus,
} from "@/features/milestoneView/lib/milestoneStatus";

/** 状態フィルタ。`overdue` は open かつ期日超過のみを抽出する派生フィルタ。 */
export type StateFilter = "all" | "open" | "closed" | "overdue";

/** ソートキー。 */
export type SortKey = "due" | "progress" | "name";

/** filterMilestones に渡す条件。 */
export type FilterCondition = {
  /** 状態フィルタ */
  state: StateFilter;
  /** 部分一致クエリ（前後の空白は呼び出し側でトリム） */
  query: string;
};

/**
 * 状態フィルタ + クエリでマイルストーンを絞り込む（純粋関数）。
 * 入力配列は破壊しない。
 * @param milestones - 対象一覧
 * @param condition - フィルタ条件
 * @param now - 現在時刻（overdue 判定用）
 * @returns 絞り込み後の新しい配列
 */
export const filterMilestones = (
  milestones: readonly MilestoneDefinition[],
  condition: FilterCondition,
  now: Date = new Date(),
): MilestoneDefinition[] => {
  const q = condition.query.trim().toLowerCase();
  return milestones.filter((m) => {
    if (q.length > 0) {
      const haystack = `${m.title ?? ""} ${m.name}`.toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }
    if (condition.state === "all") {
      return true;
    }
    const status = resolveDisplayStatus(m, now);
    if (condition.state === "open") {
      return status === "open" || status === "overdue";
    }
    if (condition.state === "closed") {
      return status === "closed";
    }
    return status === "overdue";
  });
};

/**
 * 指定キーでマイルストーンを並べ替える（純粋関数）。安定ソート。
 * - due: 期日昇順（未設定は末尾）
 * - progress: ratio 降順（未定義は末尾）
 * - name: name 昇順（ロケール比較）
 * @param milestones - 対象一覧
 * @param key - ソートキー
 * @param progress - 進捗 Map（key=progress のみ参照）
 * @returns 並べ替え後の新しい配列
 */
export const sortMilestones = (
  milestones: readonly MilestoneDefinition[],
  key: SortKey,
  progress: ReadonlyMap<string, MilestoneProgress>,
): MilestoneDefinition[] => {
  const indexed = milestones.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => {
    const cmp = compareByKey(a.m, b.m, key, progress);
    if (cmp !== 0) {
      return cmp;
    }
    return a.i - b.i;
  });
  return indexed.map(({ m }) => m);
};

/**
 * 2 件を指定キーで比較する。負/0/正の値で a が b より前/同位/後ろを表す。
 * @param a - 比較対象 1
 * @param b - 比較対象 2
 * @param key - ソートキー
 * @param progress - 進捗 Map（progress キーのみ参照）
 * @returns 比較結果（負/0/正）
 */
const compareByKey = (
  a: MilestoneDefinition,
  b: MilestoneDefinition,
  key: SortKey,
  progress: ReadonlyMap<string, MilestoneProgress>,
): number => {
  if (key === "due") {
    return dueSortKey(a) - dueSortKey(b);
  }
  if (key === "name") {
    return a.name.localeCompare(b.name);
  }
  return (
    progressSortValue(b.name, progress) - progressSortValue(a.name, progress)
  );
};

/** ratio を降順ソート用の数値へ。未定義は -Infinity（末尾送り）。 */
const progressSortValue = (
  name: string,
  progress: ReadonlyMap<string, MilestoneProgress>,
): number => {
  const p = progress.get(name);
  return p?.ratio ?? Number.NEGATIVE_INFINITY;
};

/** open / closed / overdue の 3 群に分けた結果。 */
export type MilestoneGroups = {
  open: MilestoneDefinition[];
  overdue: MilestoneDefinition[];
  closed: MilestoneDefinition[];
};

/**
 * 表示ステータスでグルーピングする（純粋関数）。
 * @param milestones - 対象一覧
 * @param now - 現在時刻（overdue 判定用）
 * @returns 3 群に分かれた結果
 */
export const groupByDisplayStatus = (
  milestones: readonly MilestoneDefinition[],
  now: Date = new Date(),
): MilestoneGroups => {
  const groups: MilestoneGroups = { open: [], overdue: [], closed: [] };
  for (const m of milestones) {
    const status = resolveDisplayStatus(m, now);
    groups[status].push(m);
  }
  return groups;
};
