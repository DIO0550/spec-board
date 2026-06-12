import {
  TitleField,
  type TitleValidationError,
} from "@/features/task-form/lib/fields/title";
import { Result } from "@/utils/result";

/**
 * SubIssuesField が保持する値（複数行の raw テキスト）。
 * 1 行 = 1 サブIssue タイトル。
 * detail feature の `SubIssue` companion（子タスク進捗集計用）とは責務が異なる別物。
 */
export type SubIssuesField = string;

/** サブIssue 行検証のエラー（違反した raw 行番号 1 始まりと TitleValidationError）。 */
export type SubIssuesValidationError = {
  line: number;
  error: TitleValidationError;
};

/**
 * サブIssue field の companion object。
 * 行分割・trim・空行無視の正規化と行単位バリデーションを pure function として提供する。
 */
export const SubIssuesField = {
  /**
   * 初期値を返す。
   * @returns 空文字
   */
  initial: (): SubIssuesField => "",

  /**
   * 行単位に分割し、各行 trim + 空行無視でタイトル配列に正規化する。
   * 重複タイトルはそのまま許容する（ファイル名衝突は BE の連番付与で回避される）。
   * @param v - 現在の raw テキスト
   * @returns 正規化済みタイトル配列（空入力は空配列）
   */
  finalize: (v: SubIssuesField): string[] =>
    v
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== ""),

  /**
   * raw 入力を行分割し、各行（trim 後）に TitleField.validate を適用して
   * 最初の違反行を返す。行番号は textarea 上の見た目と一致させるため
   * raw 入力基準の 1 始まりで数え、空行・空白のみ行は検証だけ skip する
   * （finalize のように行を詰めない）。
   * @param v - 現在の raw テキスト
   * @returns Result<void, SubIssuesValidationError>
   */
  validate: (v: SubIssuesField): Result<void, SubIssuesValidationError> => {
    const lines = v.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed === "") {
        continue;
      }
      const result = TitleField.validate(trimmed);
      if (!result.ok) {
        return Result.err({ line: i + 1, error: result.error });
      }
    }
    return Result.ok(undefined);
  },
};
