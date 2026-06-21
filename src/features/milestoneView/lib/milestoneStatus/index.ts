import type { MilestoneDefinition } from "@/domains/milestone";

/**
 * マイルストーン表示用ステータス。`def.state` の open/closed に加え、
 * due が今日より過去で open のものを overdue として派生する。
 */
export type MilestoneDisplayStatus = "open" | "closed" | "overdue";

/**
 * UI 内の他ラベル (Toolbar pill / stats) と整合させるための日本語表示名。
 * 支援技術 (aria-label) ・サイドバーの状態欄など、ユーザーに見える箇所で使う。
 */
const DISPLAY_STATUS_LABEL: Record<MilestoneDisplayStatus, string> = {
  open: "オープン",
  closed: "クローズ",
  overdue: "期限超過",
};

/**
 * 表示用ステータスを日本語ラベルに変換する。
 * @param status - 表示用ステータス
 * @returns 日本語ラベル（例: "オープン" / "クローズ" / "期限超過"）
 */
export const displayStatusLabel = (status: MilestoneDisplayStatus): string =>
  DISPLAY_STATUS_LABEL[status];

/**
 * 期日との距離をカテゴライズしたカウントダウン状態。
 * - overdue: 期日超過（open のみ）
 * - soon:    7 日以内（今日含む）
 * - future:  それ以遠
 * - done:    closed
 * - none:    due 未設定
 */
export type MilestoneCountdownKind =
  | "overdue"
  | "soon"
  | "future"
  | "done"
  | "none";

/** 1 日のミリ秒数。 */
const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** "近い" と扱う日数の閾値（design 由来）。 */
const SOON_DAY_THRESHOLD = 7;

/**
 * due 文字列を Date に変換する。"YYYY-MM-DD" はローカル 0 時として解釈し、
 * Date 直接渡しで UTC 扱いになる暗黙挙動を避ける。
 * @param due - ISO 8601 日付文字列、または undefined
 * @returns 解釈済み Date、または undefined（パース不能/未指定）
 */
const parseDue = (due: string | undefined): Date | undefined => {
  if (due === undefined) {
    return undefined;
  }
  // 先頭の YYYY-MM-DD 部分を抽出し、ロールオーバー検証する（YYYY-MM-DD 単体・
  // ISO datetime 両方に共通の前段ガード）。JS Date は 2026-02-31 を 2026-03-03 へ、
  // 2026-13-01 を 2027-01-01 へ黙ってロールオーバーするため、ここで弾かないと
  // 不正日付がそのままソート/カウントダウン/overdue 判定に使われてしまう。
  const ymdHead = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
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
    // YYYY-MM-DD 完全一致（10 文字）はローカル 0 時として返す
    // （タイムゾーン解釈による暗黙の UTC 扱いを避ける）。
    if (due.length === 10) {
      return validation;
    }
  }
  // ISO datetime（"YYYY-MM-DDTHH:MM:SS..." 形式）や他形式はネイティブパースに委ねる。
  const dt = new Date(due);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
};

/**
 * 残日数を算出する。今日 0 時を起点に整数日で返す。負値は超過日数。
 * Math.floor を使うことで due が日時形式（例: 同日 23:00）でも「経過した
 * 完全な日数」として扱い、時刻部分による 0/1 のブレを防ぐ。
 *
 * テスト用に export する（parseDue を経由せず Date を直接渡せるようにし
 * タイムゾーン依存テストになるのを防ぐ）。
 *
 * @param due - 期日 Date
 * @param now - 現在時刻
 * @returns 残日数（整数）
 */
export const daysUntil = (due: Date, now: Date): number => {
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const diff = due.getTime() - todayMidnight.getTime();
  // 今日 0 時起点の暦日差を返す。Math.round だと due が日時形式 (例: 23:00) のとき
  // 同日内でも 0/1 にブレるため、Math.floor で「経過した完全な日数」として扱う。
  return Math.floor(diff / MS_PER_DAY);
};

/**
 * マイルストーンの表示ステータスを決定する。
 * state=closed は問答無用で closed。open かつ期日超過なら overdue、それ以外は open。
 * @param def - マイルストーン定義
 * @param now - 現在時刻（テスト差し替え用）
 * @returns 表示ステータス
 */
export const resolveDisplayStatus = (
  def: MilestoneDefinition,
  now: Date = new Date(),
): MilestoneDisplayStatus => {
  if (def.state === "closed") {
    return "closed";
  }
  const due = parseDue(def.due);
  if (due !== undefined && daysUntil(due, now) < 0) {
    return "overdue";
  }
  return "open";
};

/** カウントダウン情報。badge の表示種別と人間可読ラベルを持つ。 */
export type MilestoneCountdown = {
  kind: MilestoneCountdownKind;
  label: string;
};

/**
 * カウントダウンバッジを算出する。closed→"完了"、due 未設定→"期日未設定"。
 * @param def - マイルストーン定義
 * @param now - 現在時刻
 * @returns カウントダウン情報
 */
export const resolveCountdown = (
  def: MilestoneDefinition,
  now: Date = new Date(),
): MilestoneCountdown => {
  if (def.state === "closed") {
    return { kind: "done", label: "完了" };
  }
  const due = parseDue(def.due);
  if (due === undefined) {
    return { kind: "none", label: "期日未設定" };
  }
  const days = daysUntil(due, now);
  if (days < 0) {
    return { kind: "overdue", label: `${Math.abs(days)} 日超過` };
  }
  if (days === 0) {
    return { kind: "soon", label: "今日" };
  }
  if (days <= SOON_DAY_THRESHOLD) {
    return { kind: "soon", label: `あと ${days} 日` };
  }
  return { kind: "future", label: `あと ${days} 日` };
};

/**
 * 表示順用に due の絶対値を取り出す。due 未設定は +Infinity（末尾送り）。
 * @param def - マイルストーン定義
 * @returns 並べ替えに使う数値キー
 */
export const dueSortKey = (def: MilestoneDefinition): number => {
  const due = parseDue(def.due);
  return due === undefined ? Number.POSITIVE_INFINITY : due.getTime();
};
