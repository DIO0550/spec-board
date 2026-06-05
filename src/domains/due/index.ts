declare const dueBrand: unique symbol;

/**
 * 検証済みの期限（`YYYY-MM-DD`）。`Due.parse` 経由でのみ生成される branded string。
 * 不正値を持ち得る生の `task.due`（string）と型レベルで区別する。
 */
export type Due = string & { readonly [dueBrand]: true };

const DUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `YYYY-MM-DD` を UTC ベースの日付エポック（ms）に変換する。
 * タイムゾーン差で日数がぶれないよう UTC で固定する。存在しない日付は undefined。
 *
 * @param date - 検証対象の日付文字列
 * @returns 妥当な日付なら UTC エポック（ms）、不正なら undefined
 */
const toUtcEpoch = (date: string): number | undefined => {
  if (!DUE_PATTERN.test(date)) {
    return undefined;
  }
  const [year, month, day] = date.split("-").map(Number);
  // Date.UTC は 0〜99 の年を 1900〜1999 に丸めるため、setUTCFullYear で 4 桁年を明示し
  // Rust 側の構文検証（4 桁年 0000〜9999 を有効とする）と往復結果を一致させる。
  const back = new Date(0);
  back.setUTCFullYear(year, month - 1, day);
  back.setUTCHours(0, 0, 0, 0);
  // 2026-02-29 のような不正日付は Date が繰り上げるため往復一致で弾く
  const valid =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() === month - 1 &&
    back.getUTCDate() === day;
  return valid ? back.getTime() : undefined;
};

/** Due の companion API。 */
export const Due = {
  /**
   * 任意の文字列を検証済み Due | undefined に正規化する。
   * 空文字・未設定・不正フォーマットはすべて undefined。
   * 成功時のみ branded Due を返す（cast はこの 1 箇所に閉じる）。
   *
   * @param raw - 任意の入力文字列（未設定可）
   * @returns 妥当な `YYYY-MM-DD` なら branded Due、それ以外は undefined
   */
  parse: (raw: string | undefined): Due | undefined => {
    if (raw === undefined || raw === "") {
      return undefined;
    }
    return toUtcEpoch(raw) === undefined ? undefined : (raw as Due);
  },

  /**
   * due を today 基準で相対表現に変換する。生 string を受け取り内部で検証する。
   *
   * @param due - 期限の生文字列（未検証・未設定可）
   * @param today - 基準日（`YYYY-MM-DD`）
   * @returns 「今日」/「あと X 日」/「X 日超過（期限切れ）」。不正値は undefined。
   */
  format: (due: string | undefined, today: string): string | undefined => {
    const dueEpoch = due === undefined ? undefined : toUtcEpoch(due);
    const todayEpoch = toUtcEpoch(today);
    if (dueEpoch === undefined || todayEpoch === undefined) {
      return undefined;
    }
    const diffDays = Math.round((dueEpoch - todayEpoch) / MS_PER_DAY);
    if (diffDays === 0) {
      return "今日";
    }
    if (diffDays > 0) {
      return `あと ${diffDays} 日`;
    }
    return `${-diffDays} 日超過（期限切れ）`;
  },

  /**
   * due が today より過去（期限切れ）かを返す。生 string を受け取り内部で検証する。
   *
   * @param due - 期限の生文字列（未検証・未設定可）
   * @param today - 基準日（`YYYY-MM-DD`）
   * @returns 期限切れなら true。不正値・未設定は false。
   */
  isOverdue: (due: string | undefined, today: string): boolean => {
    const dueEpoch = due === undefined ? undefined : toUtcEpoch(due);
    const todayEpoch = toUtcEpoch(today);
    if (dueEpoch === undefined || todayEpoch === undefined) {
      return false;
    }
    return dueEpoch < todayEpoch;
  },
} as const;
