const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;
const WEEKS = 7 * DAYS;
const MONTHS = 30 * DAYS;
const YEARS = 365 * DAYS;

/**
 * Date を YYYY/MM/DD 表記へ整形する（タイムゾーンは ISO の UTC 起点）。
 * @param d - 整形対象の Date
 * @returns YYYY/MM/DD 文字列
 */
const toYmd = (d: Date): string => {
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
};

/**
 * ISO 文字列を「たった今 / N 分前 / N 時間前 / 昨日 / N 日前 / N週間前 / Nヶ月前 / YYYY/MM/DD」へ整形する。
 * パース不能は元文字列をそのまま返す（lenient）。基準時刻は引数注入でテスト可能にする。
 *
 * @param iso - 対象時刻（ISO 8601 文字列）
 * @param now - 基準時刻。省略時は現在時刻。
 * @returns 整形済み相対時刻表記
 */
export const formatRelativeTime = (
  iso: string,
  now: Date = new Date(),
): string => {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) {
    return iso;
  }
  const diff = now.getTime() - target.getTime();
  // 未来の時刻 / ごく直近は「たった今」に丸める（小さな時計ずれを吸収）。
  if (diff < MINUTES) {
    return "たった今";
  }
  if (diff < HOURS) {
    return `${Math.floor(diff / MINUTES)}分前`;
  }
  if (diff < DAYS) {
    return `${Math.floor(diff / HOURS)}時間前`;
  }
  if (diff < 2 * DAYS) {
    return "昨日";
  }
  if (diff < WEEKS) {
    return `${Math.floor(diff / DAYS)}日前`;
  }
  if (diff < MONTHS) {
    return `${Math.floor(diff / WEEKS)}週間前`;
  }
  if (diff < YEARS) {
    return `${Math.floor(diff / MONTHS)}ヶ月前`;
  }
  return toYmd(target);
};
