import type { FileNameValidationError } from "@/features/task-form/lib/fields/fileName";

/**
 * ファイル名バリデーションエラーを画面表示用の日本語メッセージに変換する。
 * @param error バリデーションエラー
 * @returns 表示用文字列
 */
export const fileNameErrorMessage = (error: FileNameValidationError): string =>
  `ファイル名に使用できない文字が含まれています: ${error.chars.join(" ")}`;
