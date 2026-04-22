/** TitleField が保持する値の型（生の入力文字列） */
export type TitleField = string;

/**
 * タイトル field の companion object。
 * 初期値・バリデーション・正規化を pure function として提供する。
 */
export const TitleField = {
  /**
   * 初期値を返す。
   * @returns 空文字
   */
  initial: (): TitleField => "",

  /**
   * タイトルをバリデーションする。
   * trim 後が空の場合にエラー文字列、妥当ならば undefined を返す。
   * @param v - 現在の値
   * @returns エラー文字列または undefined
   */
  validate: (v: TitleField): string | undefined =>
    v.trim().length === 0 ? "タイトルを入力してください" : undefined,

  /**
   * 送信用に値を正規化する（前後空白除去）。
   * @param v - 現在の値
   * @returns 正規化された値
   */
  normalize: (v: TitleField): string => v.trim(),
};
