import type { LabelDefinition } from "@/domains/label-definition";
import { LabelRegistry } from "@/domains/label-registry";

/** ソートキー。 */
export type LabelSort = "name" | "usage" | "updated";

/**
 * グループフィルタ。実グループ名 "all" との衝突を避けるため判別可能 union にする
 * （`"all" | string` だと実グループ名 "all" と区別不能）。
 */
export type LabelGroupFilter =
  | { kind: "all" }
  | { kind: "group"; value: string };

/**
 * ラベルが属するグループを返す（domain companion `LabelRegistry.effectiveGroup` へ委譲）。
 * 「未指定 / 空文字 → name から導出」のルールを domain に集約することで、テーブルの
 * バッジ表示・スワッチ色解決と一致させる（バッジ色とバッジ名の食い違いを防ぐ）。
 * @param label - ラベル定義
 * @returns グループ名
 */
const groupOf = (label: LabelDefinition): string =>
  LabelRegistry.effectiveGroup(label);

/**
 * 検索キーワード（name / description 部分一致・大小無視）+ グループ絞り込み。
 * `group.kind === "all"` は全グループ通過。
 * @param labels - 全ラベル
 * @param keyword - 検索キーワード
 * @param group - グループフィルタ
 * @returns 絞り込み後のラベル配列（元順）
 */
export const filterLabels = (
  labels: readonly LabelDefinition[],
  keyword: string,
  group: LabelGroupFilter,
): LabelDefinition[] => {
  const kw = keyword.trim().toLowerCase();
  return labels.filter((label) => {
    if (group.kind === "group" && groupOf(label) !== group.value) {
      return false;
    }
    if (kw === "") {
      return true;
    }
    const hay = `${label.name}\n${label.description ?? ""}`.toLowerCase();
    return hay.includes(kw);
  });
};

/**
 * ISO 文字列を Date.parse で数値タイムスタンプへ変換する。
 * @param iso - 対象 ISO 文字列（undefined 可）
 * @returns ミリ秒タイムスタンプ。undefined / パース不能なら null
 */
const parsedTime = (iso: string | undefined): number | null => {
  if (iso === undefined) {
    return null;
  }
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * ラベルを指定キーで並べ替える（安定）。
 * - `name`: 昇順
 * - `usage`: 使用数降順
 * - `updated`: 新しい順。`updated` 無し / パース不能は末尾へ送る
 * @param labels - 並べ替え対象
 * @param sort - ソートキー
 * @param usageCounts - 使用数（`usage` ソート時に使用）
 * @returns 新しい配列
 */
export const sortLabels = (
  labels: readonly LabelDefinition[],
  sort: LabelSort,
  usageCounts: Record<string, number>,
): LabelDefinition[] => {
  const indexed = labels.map((label, index) => ({ label, index }));
  indexed.sort((a, b) => {
    if (sort === "name") {
      const cmp = a.label.name.localeCompare(b.label.name);
      return cmp !== 0 ? cmp : a.index - b.index;
    }
    if (sort === "usage") {
      const ua = usageCounts[a.label.name] ?? 0;
      const ub = usageCounts[b.label.name] ?? 0;
      return ub - ua !== 0 ? ub - ua : a.index - b.index;
    }
    // sort === "updated"
    const ta = parsedTime(a.label.updated);
    const tb = parsedTime(b.label.updated);
    if (ta === null && tb === null) {
      return a.index - b.index;
    }
    if (ta === null) {
      return 1;
    }
    if (tb === null) {
      return -1;
    }
    return tb - ta !== 0 ? tb - ta : a.index - b.index;
  });
  return indexed.map((e) => e.label);
};

/**
 * 統計（総数 / 使用中数 / 未使用数）を算出する。
 * @param labels - 集計対象
 * @param usageCounts - 使用数（未定義キーは未使用扱い）
 * @returns total/used/unused
 */
export const labelStats = (
  labels: readonly LabelDefinition[],
  usageCounts: Record<string, number>,
): { total: number; used: number; unused: number } => {
  let used = 0;
  for (const label of labels) {
    if ((usageCounts[label.name] ?? 0) > 0) {
      used += 1;
    }
  }
  return { total: labels.length, used, unused: labels.length - used };
};

/**
 * グループ別件数を算出する（チップ UI 用）。
 * 出現順序（初出順）でグループを並べる。
 * @param labels - 集計対象
 * @returns all + グループ別件数
 */
export const labelGroupCounts = (
  labels: readonly LabelDefinition[],
): { all: number; groups: { group: string; count: number }[] } => {
  const order: string[] = [];
  // accumulator は Map にする。group は frontmatter / name 由来で任意文字列のため、
  // `__proto__` / `constructor` 等のプロトタイプキーが入っても継承プロパティと
  // 衝突せず正しく数えるため。
  const counts = new Map<string, number>();
  for (const label of labels) {
    const g = groupOf(label);
    if (!counts.has(g)) {
      order.push(g);
      counts.set(g, 0);
    }
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return {
    all: labels.length,
    groups: order.map((group) => ({ group, count: counts.get(group) ?? 0 })),
  };
};

/**
 * 使用中ラベルのカラー集計（フッター用）。
 * 色キーは color（`#RRGGBB`）優先、無ければ group（既定色との重複を避けるため）。
 * 未使用ラベル（usageCounts 0 / 未定義）は除外する。
 * @param labels - 集計対象
 * @param usageCounts - 使用数
 * @returns 色キー → 件数の配列（初出順）
 */
export const labelColorTally = (
  labels: readonly LabelDefinition[],
  usageCounts: Record<string, number>,
): { color: string; count: number }[] => {
  const order: string[] = [];
  // group fallback 経由でプロトタイプキー名が key になりうるため Map で集計する
  // （labelGroupCounts と同じ理由）。
  const counts = new Map<string, number>();
  for (const label of labels) {
    if ((usageCounts[label.name] ?? 0) <= 0) {
      continue;
    }
    const key = label.color ?? groupOf(label);
    if (!counts.has(key)) {
      order.push(key);
      counts.set(key, 0);
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.map((color) => ({ color, count: counts.get(color) ?? 0 }));
};
