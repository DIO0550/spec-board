const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

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
  // 1 分以上先の未来は時計ずれでは説明できない異常値として扱い、日付表記で
  // 隠さず提示する。許容範囲（過去 1 分以内 + 同程度の時計ずれ）は「たった今」に丸める。
  if (diff < -MS_PER_MINUTE) {
    return toYmd(target);
  }
  if (diff < MS_PER_MINUTE) {
    return "たった今";
  }
  if (diff < MS_PER_HOUR) {
    return `${Math.floor(diff / MS_PER_MINUTE)}分前`;
  }
  if (diff < MS_PER_DAY) {
    return `${Math.floor(diff / MS_PER_HOUR)}時間前`;
  }
  if (diff < 2 * MS_PER_DAY) {
    return "昨日";
  }
  if (diff < MS_PER_WEEK) {
    return `${Math.floor(diff / MS_PER_DAY)}日前`;
  }
  if (diff < MS_PER_MONTH) {
    return `${Math.floor(diff / MS_PER_WEEK)}週間前`;
  }
  if (diff < MS_PER_YEAR) {
    return `${Math.floor(diff / MS_PER_MONTH)}ヶ月前`;
  }
  return toYmd(target);
};
