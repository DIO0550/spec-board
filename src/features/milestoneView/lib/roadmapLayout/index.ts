import type { MilestoneDefinition } from "@/domains/milestone";
import {
  type MilestoneDisplayStatus,
  resolveDisplayStatus,
} from "@/features/milestoneView/lib/milestoneStatus";

/** ロードマップ 1 行分のレイアウト情報。 */
export type RoadmapRow = {
  /** 元定義 */
  def: MilestoneDefinition;
  /** 表示ステータス */
  status: MilestoneDisplayStatus;
  /** バー左端の％ (0..100)。今月起点 */
  leftPercent: number;
  /** バー幅の％ (>0)。最小幅は 1 か月分（100/columns） */
  widthPercent: number;
  /**
   * バーの想定スパン（DEFAULT_SPAN_MONTHS 前から MIN_BAR_MONTHS 後まで）の
   * 一部でも表示範囲 0..COLUMN_COUNT を外れたかどうか。due 自体が範囲内でも
   * 想定スパンが先頭/末尾で切れる場合は true になる。
   */
  clipped: boolean;
};

/** ロードマップ全体のレイアウト。 */
export type RoadmapLayout = {
  /** ヘッダ用の月ラベル配列（例 "2026-06"） */
  monthLabels: string[];
  /** 各マイルストーンの行 */
  rows: RoadmapRow[];
  /** 今日マーカーの位置（％） */
  todayPercent: number;
};

/** 表示する月の数（design に合わせ 8 か月）。 */
const COLUMN_COUNT = 8;
/** 1 バーが占める最小月数（最低 1 か月分の幅は確保する）。 */
const MIN_BAR_MONTHS = 1;
/** バーの「想定スパン」月数（due だけが与えられたとき、その何か月前から伸ばすか）。 */
const DEFAULT_SPAN_MONTHS = 2;

/**
 * Date を「YYYY-MM」文字列に整形する（ローカル基準）。
 * @param date - 元の日時
 * @returns ヘッダー表示用の年月文字列
 */
const formatYearMonth = (date: Date): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
};

/**
 * "YYYY-MM-DD" / Date 文字列を Date に変換する。失敗時 undefined。
 * @param raw - 日付文字列、または undefined
 * @returns 解釈済み Date、または undefined
 */
const parseDate = (raw: string | undefined): Date | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  // YYYY-MM-DD 単体・ISO datetime 両方に共通の前段ロールオーバーガード。
  // 2026-02-31 → 2026-03-03 のような JS Date の暗黙ロールオーバーを弾く。
  const ymdHead = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (ymdHead !== null) {
    const y = Number(ymdHead[1]);
    const m = Number(ymdHead[2]);
    const d = Number(ymdHead[3]);
    const validation = new Date(y, m - 1, d);
    if (
      validation.getFullYear() !== y ||
      validation.getMonth() !== m - 1 ||
      validation.getDate() !== d
    ) {
      return undefined;
    }
    if (raw.length === 10) {
      return validation;
    }
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
};

/**
 * 2 つの Date の差を月単位（小数）で返す。負値は from の方が後ろの場合。
 *
 * 平均日数（30.4375）を使う近似ではなく、`年月インデックス + 月内割合` の
 * 差分として計算する。これにより各月の境界（次月 1 日）がちょうど整数 N か月
 * となり、ロードマップグリッドの列境界と完全に整合する。
 *
 * @param from - 起点
 * @param to - 終点
 * @returns 月数差（小数）
 */
const monthsBetween = (from: Date, to: Date): number => {
  const fromIndex = monthIndex(from) + monthFraction(from);
  const toIndex = monthIndex(to) + monthFraction(to);
  return toIndex - fromIndex;
};

/**
 * 0001-01 起点の年月インデックス（year * 12 + month）。
 * @param date - 対象日時
 * @returns 年月インデックス（整数）
 */
const monthIndex = (date: Date): number =>
  date.getFullYear() * 12 + date.getMonth();

/**
 * 当該月内での経過割合 (0..1 未満)。
 * 日付 + 時分秒を月の総日数で正規化する。
 * @param date - 対象日時
 * @returns 月内の経過割合（0 以上 1 未満）
 */
const monthFraction = (date: Date): number => {
  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  const dayWithTime =
    date.getDate() -
    1 +
    (date.getHours() * 3600 +
      date.getMinutes() * 60 +
      date.getSeconds() +
      date.getMilliseconds() / 1000) /
      86400;
  return dayWithTime / daysInMonth;
};

/**
 * 今月起点で `COLUMN_COUNT` か月のロードマップレイアウトを計算する。
 * 各マイルストーンのバーは due 月にかかるよう描画する。due 未設定は配置不能なので除外する。
 * @param milestones - 対象一覧（呼び出し側で表示順を整えておくこと）
 * @param now - 現在時刻（基準月の決定とtodayマーカーに使う）
 * @returns ロードマップのレイアウト情報
 */
export const computeRoadmapLayout = (
  milestones: readonly MilestoneDefinition[],
  now: Date = new Date(),
): RoadmapLayout => {
  const baseMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabels: string[] = [];
  for (let i = 0; i < COLUMN_COUNT; i += 1) {
    const dt = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + i, 1);
    monthLabels.push(formatYearMonth(dt));
  }

  const todayMonthsFromBase = monthsBetween(baseMonth, now);
  const todayPercent = clampPercent((todayMonthsFromBase / COLUMN_COUNT) * 100);

  const minWidthPercent = toPercentOfColumns(MIN_BAR_MONTHS);

  const rows: RoadmapRow[] = [];
  for (const def of milestones) {
    const due = parseDate(def.due);
    if (due === undefined) {
      continue;
    }
    const dueOffset = monthsBetween(baseMonth, due);
    const startOffset = dueOffset - DEFAULT_SPAN_MONTHS;
    const endOffset = dueOffset + MIN_BAR_MONTHS;
    const rawLeft = toPercentOfColumns(startOffset);
    const rawRight = toPercentOfColumns(endOffset);
    const left = clampPercent(rawLeft);
    const right = clampPercent(rawRight);
    // クランプ後の生幅を最小幅で底上げしつつ、left + width が 100 を超えないように
    // left を後ろへずらす（バーがトラックからはみ出さないことを保証する）。
    const widthPercent = Math.max(right - left, minWidthPercent);
    const leftPercent = Math.max(0, Math.min(left, 100 - widthPercent));
    rows.push({
      def,
      status: resolveDisplayStatus(def, now),
      leftPercent,
      widthPercent,
      // バーの想定スパン（startOffset .. endOffset）の一部でも 0..COLUMN_COUNT
      // の範囲外なら clipped。境界ちょうど（endOffset == COLUMN_COUNT）は範囲内とみなす。
      clipped: rawLeft < 0 || rawRight > 100,
    });
  }
  return { monthLabels, rows, todayPercent };
};

/**
 * 月数値 (0..COLUMN_COUNT) を COLUMN_COUNT を基準にしたパーセント値へ変換する。
 * 範囲外 (負値 / COLUMN_COUNT 超) はそのまま返し、クランプは呼び出し側で行う。
 * @param months - 月数値（小数可・範囲外可）
 * @returns COLUMN_COUNT 基準のパーセント値
 */
const toPercentOfColumns = (months: number): number =>
  (months / COLUMN_COUNT) * 100;

/**
 * 0..100 にクランプする。負値は 0、100 超は 100。
 * @param value - クランプ前の値
 * @returns 0..100 にクランプ済みの値
 */
const clampPercent = (value: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
};
