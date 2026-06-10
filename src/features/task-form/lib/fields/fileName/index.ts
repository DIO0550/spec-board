import { KebabCase } from "@/domains/KebabCase";
import { Result } from "@/utils/result";
// 予約文字集合は title field の export 済み定数を再利用する（再定義しない）。
import { FORBIDDEN_TITLE_CHARS } from "../title";

declare const fileNameFieldBrand: unique symbol;

/**
 * FileNameField が保持する値（拡張子 .md を除いた base 文字列）。
 * `KebabCase` / `Due` と同じ branded string パターンを踏襲し、
 * `initial` / `fromTitle` / `normalizeInput` の companion 経由でのみ生成される。
 * 生の string を reducer state に直接流し込めなくすることで、
 * `.md` 剥がし・trim を通っていない値の混入を型レベルで防ぐ。
 */
export type FileNameField = string & { readonly [fileNameFieldBrand]: true };

/** ファイル名バリデーションのエラー判別共用体。 */
export type FileNameValidationError = {
  code: "FORBIDDEN_CHAR";
  chars: string[];
};

/**
 * ファイル名 field の companion object。
 * 初期値・タイトル追従・正規化・バリデーション・送信値変換を pure function として提供する。
 */
export const FileNameField = {
  /**
   * 初期値を返す。
   * @returns 空文字（タイトル追従中の未確定状態）
   */
  initial: (): FileNameField => "" as FileNameField,

  /**
   * タイトルから kebab-case base を導出する（自動追従用）。
   * KebabCase brand から FileNameField brand へは companion 内でのみ詰め替える。
   * @param title - タイトルの生文字列
   * @returns kebab-case 化した base
   */
  fromTitle: (title: string): FileNameField =>
    KebabCase.from(title.trim()) as string as FileNameField,

  /**
   * raw 入力値を base に正規化する。前後空白除去 + 末尾 `.md`（大文字小文字不問）を剥がす。
   * ユーザーが `.md` 込みで入力しても二重拡張子にしない。
   * UI の onChange から渡る生文字列を branded 値へ変換する唯一の入口。
   * @param v - 入力の生文字列
   * @returns 正規化された base
   */
  normalizeInput: (v: string): FileNameField =>
    v.trim().replace(/\.md$/i, "") as FileNameField,

  /**
   * 送信値を返す。
   * @param v - 現在の base
   * @returns base が空なら undefined（BE のタイトル由来生成にフォールバック）、非空なら `${base}.md`
   */
  toParam: (v: FileNameField): string | undefined => {
    if (v === "") {
      return undefined;
    }
    return `${v}.md`;
  },

  /**
   * base をバリデーションする。OS 予約文字を含む場合のみエラー。空は許容する
   * （空 = 追従中で BE のタイトル由来生成に委ねるため）。
   * @param v - 現在の base
   * @returns Result<void, FileNameValidationError>
   */
  validate: (v: FileNameField): Result<void, FileNameValidationError> => {
    const forbidden = FORBIDDEN_TITLE_CHARS.filter((c) => v.includes(c));
    if (forbidden.length > 0) {
      return Result.err({ code: "FORBIDDEN_CHAR", chars: [...forbidden] });
    }
    return Result.ok(undefined);
  },
};
