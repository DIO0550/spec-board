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
 * milestoneView feature 内で共通の date パーサとして使う（roadmapLayout も参照）。
 * @param due - ISO 8601 日付文字列、または undefined
 * @returns 解釈済み Date、または undefined（パース不能/未指定）
 */
export const parseDue = (due: string | undefined): Date | undefined => {
  if (due === undefined) {
    return undefined;
  }
  // 厳密な ISO 8601 (YYYY-MM-DD または YYYY-MM-DDT...) のみ受理する。
  // 先頭空白を含む " 2026-02-31" や "2026/02/31" のような区切り違い、
  // "March 3 2026" 等の自由形式はネイティブパースで日付ロールオーバー
  // (2026-02-31 → 2026-03-03) してしまうため、ここで弾かないと
  // 不正日付のままソート/カウントダウン/overdue 判定に使われる。
  // 末尾までマッチさせて「YYYY-MM-DD 単独」または「YYYY-MM-DDT<ISO time> の
  // ISO datetime」のみを受理する。datetime 部分は厳密な ISO time 形式に限定し、
  // 「2026-06-21Tnot-a-date」「2026-06-21T25:99」のような不正な suffix を弾く。
  // ISO time: HH:MM(:SS(.sss)?)? + 任意の TZ 指定 (Z / ±HH:MM / ±HHMM / ±HH)。
  const isoMatch =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2})(?::?(\d{2}))?)?)?$/.exec(
      due,
    );
  if (isoMatch === null) {
    return undefined;
  }
  const y = Number(isoMatch[1]);
  const m = Number(isoMatch[2]);
  const d = Number(isoMatch[3]);
  // `new Date(y, m-1, d)` は y=0..99 を 1900..1999 へ丸めるため、
  // `0001-01-01` のような 4 桁年が表現できない。setFullYear で明示的に渡し、
  // src/domains/due の 4 桁年方針と揃える。
  const validation = new Date(0);
  validation.setFullYear(y, m - 1, d);
  validation.setHours(0, 0, 0, 0);
  // JS Date は 2026-02-31 を 2026-03-03 へ、2026-13-01 を 2027-01-01 へ
  // 黙ってロールオーバーするため、年月日のフィールド一致で検証する。
  if (
    validation.getFullYear() !== y ||
    validation.getMonth() !== m - 1 ||
    validation.getDate() !== d
  ) {
    return undefined;
  }
  // 時刻部分 (HH/MM/SS) が含まれる場合は範囲検証 (HH=0..23 / MM=0..59 / SS=0..59)。
  // 60 (うるう秒) は milestone 用途では考慮不要なので 0..59 で弾く。
  if (isoMatch[4] !== undefined) {
    const hh = Number(isoMatch[4]);
    const mm = Number(isoMatch[5]);
    const ss = isoMatch[6] === undefined ? 0 : Number(isoMatch[6]);
    if (hh > 23 || mm > 59 || ss > 59) {
      return undefined;
    }
  }
  // TZ オフセット (±HH:MM / ±HHMM / ±HH) も HH=0..23 / MM=0..59 で範囲検証する。
  // ISO 8601 上は実用的な最大が ±14:00 程度だが、ここでは時刻と同じ HH/MM 範囲で許容する
  // （実用上 14 超のオフセットを持つ TZ は存在しないが過剰な厳密化はしない）。
  if (isoMatch[8] !== undefined) {
    const tzHh = Number(isoMatch[8]);
    const tzMm = isoMatch[9] === undefined ? 0 : Number(isoMatch[9]);
    if (tzHh > 23 || tzMm > 59) {
      return undefined;
    }
  }
  // milestone due は calendar date として提示される (期日表示・カウントダウン・
  // ロードマップ位置はすべて日単位)。ISO datetime ("2026-06-21T00:00:00Z") を
  // ネイティブパースで Date 化すると UTC オフセットによってローカル日付が前日へ
  // ずれ (西側 TZ で 6/20 になる等)、daysUntil や resolveDisplayStatus が誤判定
  // することがあるため、ISO datetime も先頭 YYYY-MM-DD 部分のみを採用して
  // ローカル 0 時として返す（時刻部分は捨てる）。
  return validation;
};

/**
 * due 文字列を表示用 YYYY-MM-DD に正規化する（parseDue と同じ受理判定を使う）。
 * - 受理形式: YYYY-MM-DD / YYYY-MM-DDT...
 * - パース不能・実在しない日付は undefined（UI 側で「未設定」表示に倒す）
 * - ISO datetime であっても先頭 YYYY-MM-DD のみを返す（時刻部分は破棄）
 * @param due - 任意の入力文字列、または undefined
 * @returns 表示用の YYYY-MM-DD、または undefined
 */
export const formatDue = (due: string | undefined): string | undefined => {
  const dt = parseDue(due);
  if (dt === undefined) {
    return undefined;
  }
  // parseDue は 0..99 年も保持するので、formatDue 側も padStart(4, "0") で
  // 4 桁年に揃える。これにより "0001-01-01" のような ISO 8601 日付がそのまま
  // 表示でも再現される。
  const y = String(dt.getFullYear()).padStart(4, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
  // ローカル日付（年月日）を UTC エポックに正規化してから差分を取る。
  // ローカル midnight 同士の ms 差を 24h で割ると DST のある地域で 23h/25h
  // となる日があり日数差が ±1 にブレてしまうため、src/domains/due と同じく
  // UTC エポック差分方式に揃えてタイムゾーン/DST 非依存にする。
  // また `Date.UTC(y, ...)` は y=0..99 を 1900..1999 へ丸めるため、4 桁年を
  // 保持するために setUTCFullYear 経由で組み立てる。
  const dueEpoch = toUtcDayEpoch(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
  );
  const todayEpoch = toUtcDayEpoch(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  // 暦日差を Math.floor で返す。due が日時形式（例: 同日 23:00）でも UTC エポックは
  // 年月日のみで構築するので時刻部分は影響しない（同日内 → 0）。
  return Math.floor((dueEpoch - todayEpoch) / MS_PER_DAY);
};

/**
 * 年月日を UTC 0 時のエポック (ms) へ変換する。
 * `Date.UTC` の 0..99 → 1900..1999 丸めを回避するため `setUTCFullYear` を使う。
 * @param year - 西暦 (4 桁)
 * @param monthIndex - 月 (0..11)
 * @param day - 日 (1..31)
 * @returns UTC エポック (ms)
 */
const toUtcDayEpoch = (
  year: number,
  monthIndex: number,
  day: number,
): number => {
  const dt = new Date(0);
  dt.setUTCFullYear(year, monthIndex, day);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime();
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
