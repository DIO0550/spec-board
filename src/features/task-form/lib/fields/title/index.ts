import { KebabCase } from "@/domains/kebab-case";
import { Result } from "@/utils/result";

/** TitleField が保持する値の型（生の入力文字列） */
export type TitleField = string;

/** タイトルに許容する最大文字数（trim 後） */
export const TITLE_MAX_LENGTH = 200;

/**
 * タイトルに使用を禁止する文字（OS ファイル名予約文字）。
 * 配列の順序は FORBIDDEN_CHAR エラーの `chars` 列挙順にも使用する。
 */
export const FORBIDDEN_TITLE_CHARS = [
  "<",
  ">",
  ":",
  '"',
  "/",
  "\\",
  "|",
  "?",
  "*",
] as const;

/** タイトルバリデーションのエラー判別共用体。 */
export type TitleValidationError =
  | { code: "EMPTY" }
  | { code: "TOO_LONG"; max: number; actual: number }
  | { code: "FORBIDDEN_CHAR"; chars: string[] };

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
   * 送信用に値を正規化する（前後空白除去）。
   * @param v - 現在の値
   * @returns 正規化された値
   */
  normalize: (v: TitleField): string => v.trim(),

  /**
   * タイトルをバリデーションする。
   * 優先順位は EMPTY → FORBIDDEN_CHAR → TOO_LONG。
   * 最初にマッチしたエラーのみ返し、後続は評価しない。
   * ファイル名重複は submit をブロックせず、保存時に BE が連番付与で回避する。
   * @param v 現在の値
   * @returns Result<void, TitleValidationError>
   */
  validate: (v: TitleField): Result<void, TitleValidationError> => {
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      return Result.err({ code: "EMPTY" });
    }
    const forbidden = FORBIDDEN_TITLE_CHARS.filter((c) => v.includes(c));
    if (forbidden.length > 0) {
      return Result.err({ code: "FORBIDDEN_CHAR", chars: [...forbidden] });
    }
    if (trimmed.length > TITLE_MAX_LENGTH) {
      return Result.err({
        code: "TOO_LONG",
        max: TITLE_MAX_LENGTH,
        actual: trimmed.length,
      });
    }
    const kebabBase = KebabCase.from(trimmed);
    if (kebabBase.length === 0) {
      // 記号のみ・アンダースコアのみ等で kebab base が空になる入力は
      // ファイル名 base が作れず、BE 側でも InvalidTitle となるため
      // EMPTY 扱いで弾く。
      return Result.err({ code: "EMPTY" });
    }
    return Result.ok(undefined);
  },
};
