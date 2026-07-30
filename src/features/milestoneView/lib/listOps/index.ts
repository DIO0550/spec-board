import type { MilestoneDefinition } from "@/domains/milestone";
import type {
  MilestoneProjection,
  MilestoneProjectionMap,
} from "@/domains/milestone-projection";
import {
  dueSortKey,
  resolveDisplayStatus,
} from "@/features/milestoneView/lib/milestoneStatus";

/** 状態フィルタ。`overdue` は open かつ期日超過のみを抽出する派生フィルタ。 */
export type StateFilter = "all" | "open" | "closed" | "overdue";

/**
 * ソートキー。
 * - order: milestones.yml で設定された order を尊重した既定順序（入力順を保持）
 * - due: 期日昇順
 * - progress: 進捗 ratio 降順
 * - name: name 昇順
 */
export type SortKey = "order" | "due" | "progress" | "name";

/** filterMilestones に渡す条件。 */
export type FilterCondition = {
  /** 状態フィルタ */
  state: StateFilter;
  /** 部分一致クエリ（filterMilestones 内で前後の空白をトリムし、空なら全件通過） */
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
      // overdue は別途「期限超過」フィルタで分離表示するため、open フィルタには含めない。
      return status === "open";
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
 * @param isProgressRatioAvailable - done columnを解決でき、ratioを比較できるか
 * @returns 並べ替え後の新しい配列
 */
export const sortMilestones = (
  milestones: readonly MilestoneDefinition[],
  key: SortKey,
  progress: MilestoneProjectionMap,
  isProgressRatioAvailable = true,
): MilestoneDefinition[] => {
  const indexed = milestones.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => {
    const cmp = compareByKey(a.m, b.m, key, progress, isProgressRatioAvailable);
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
 * @param isProgressRatioAvailable - ratioを比較できるか
 * @returns 比較結果（負/0/正）
 */
const compareByKey = (
  a: MilestoneDefinition,
  b: MilestoneDefinition,
  key: SortKey,
  progress: MilestoneProjectionMap,
  isProgressRatioAvailable: boolean,
): number => {
  if (key === "order") {
    // order キーは入力順序を保つ。compareByKey はすべて 0 を返し、上位の
    // sortMilestones が安定ソートの tie-break (元 index) で順序を維持する。
    // 入力は MilestoneViewScreen 側で既に Milestone.sortByOrder() 済み。
    return 0;
  }
  if (key === "due") {
    // due 未設定同士は +Infinity 同士の減算で NaN になり安定ソートが崩れるため、
    // 大小比較で 0/-1/1 を返す形にしておく。
    return compareNumbers(dueSortKey(a), dueSortKey(b));
  }
  if (key === "name") {
    return a.name.localeCompare(b.name);
  }
  // progress は降順なので b - a 相当を compareNumbers の引数順で表現する。
  return compareNumbers(
    progressSortValue(b.name, progress, isProgressRatioAvailable),
    progressSortValue(a.name, progress, isProgressRatioAvailable),
  );
};

/**
 * 数値 2 つを 3 値 (-1 / 0 / +1) で比較する。
 * 減算を避けることで Infinity - Infinity = NaN を発生させない。
 * @param x - 比較対象 1
 * @param y - 比較対象 2
 * @returns x < y で -1、x === y で 0、x > y で +1
 */
const compareNumbers = (x: number, y: number): number => {
  if (x < y) {
    return -1;
  }
  if (x > y) {
    return 1;
  }
  return 0;
};

/** ratio を降順ソート用の数値へ。未定義は -Infinity（末尾送り）。 */
const progressSortValue = (
  name: string,
  progress: MilestoneProjectionMap,
  isProgressRatioAvailable: boolean,
): number => {
  if (!isProgressRatioAvailable) {
    return Number.NEGATIVE_INFINITY;
  }
  const projection: MilestoneProjection | undefined = progress.get(name);
  if (projection === undefined || projection.total === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return projection.done / projection.total;
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
