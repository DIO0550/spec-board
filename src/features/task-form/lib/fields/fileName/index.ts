import { KebabCase } from "@/domains/kebab-case";
import { Result } from "@/utils/result";
// 予約文字集合は title field の export 済み定数を再利用する（再定義しない）。
import { FORBIDDEN_TITLE_CHARS } from "../title";

declare const fileNameFieldBrand: unique symbol;

/**
 * FileNameField が保持する値（ファイル名欄の入力値）。
 * `KebabCase` / `Due` と同じ branded string パターンを踏襲し、
 * `initial` / `fromTitle` / `fromInput` の companion 経由でのみ生成される。
 *
 * 入力中の値は**生のまま**保持し（controlled input への正規化書き戻しは
 * スペース入力や `.md` を含む base の入力過程を破壊するため行わない）、
 * trim + 末尾 `.md` 剥がしの正規化は送信値変換（`toParam`）に閉じる。
 * TitleField の「state は生文字列・正規化は submit 時」方式と揃える。
 */
export type FileNameField = string & { readonly [fileNameFieldBrand]: true };

/** ファイル名バリデーションのエラー判別共用体。 */
export type FileNameValidationError = {
  code: "FORBIDDEN_CHAR";
  chars: string[];
};

/**
 * 入力値を正規化した base（trim + 末尾 `.md`（大文字小文字不問）剥がし）を返す。
 * `toParam` と空判定で共有する内部 helper。
 * @param v - 現在の入力値
 * @returns 正規化済み base
 */
const normalizedBase = (v: FileNameField): string =>
  v.trim().replace(/\.md$/i, "");

/**
 * ファイル名 field の companion object。
 * 初期値・タイトル追従・バリデーション・送信値変換を pure function として提供する。
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
   * UI の onChange から渡る生文字列を branded 値へ変換する唯一の入口。
   * 入力中の正規化は行わず生のまま保持する（正規化は `toParam` が担う）。
   * @param v - 入力の生文字列
   * @returns 入力値そのままの branded 値
   */
  fromInput: (v: string): FileNameField => v as FileNameField,

  /**
   * 送信値を返す。ここで初めて trim + 末尾 `.md` 剥がしの正規化を行い、
   * ユーザーが `.md` 込みで入力しても二重拡張子にしない。
   * @param v - 現在の入力値
   * @returns 正規化後 base が空なら undefined（BE のタイトル由来生成にフォールバック）、
   *          非空なら `${base}.md`
   */
  toParam: (v: FileNameField): string | undefined => {
    const base = normalizedBase(v);
    if (base === "") {
      return undefined;
    }
    return `${base}.md`;
  },

  /**
   * 入力値をバリデーションする。OS 予約文字を含む場合のみエラー。空は許容する
   * （空 = 追従中で BE のタイトル由来生成に委ねるため）。
   * @param v - 現在の入力値
   * @returns Result<void, FileNameValidationError>
   */
  validate: (v: FileNameField): Result<void, FileNameValidationError> => {
    const forbidden = FORBIDDEN_TITLE_CHARS.filter((c) => v.includes(c));
    if (forbidden.length > 0) {
      return Result.err({ code: "FORBIDDEN_CHAR", chars: forbidden });
    }
    return Result.ok(undefined);
  },
};
