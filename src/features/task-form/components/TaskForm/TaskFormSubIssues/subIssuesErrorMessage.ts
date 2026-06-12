import type { SubIssuesValidationError } from "@/features/task-form/lib/fields/subIssues";
import { titleErrorMessage } from "../TaskFormTitle/titleErrorMessage";

/**
 * サブIssue 行バリデーションエラーを行番号付きの日本語メッセージに変換する。
 * 内部の TitleValidationError 部分は titleErrorMessage の文言規約に揃える。
 * @param error バリデーションエラー
 * @returns 表示用文字列（例: 「2 行目: 使用できない文字が含まれています: :」）
 */
export const subIssuesErrorMessage = (
  error: SubIssuesValidationError,
): string => `${error.line} 行目: ${titleErrorMessage(error.error)}`;
