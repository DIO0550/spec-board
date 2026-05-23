import type { TitleValidationError } from "@/features/task-form/lib/fields/title";

/**
 * タイトルバリデーションエラーを画面表示用の日本語メッセージに変換する。
 * @param error バリデーションエラー
 * @returns 表示用文字列
 */
export const titleErrorMessage = (error: TitleValidationError): string => {
  switch (error.code) {
    case "EMPTY":
      return "タイトルを入力してください";
    case "DUPLICATE":
      return "同じ名前のタスクがすでに存在します";
    case "TOO_LONG":
      return `タイトルは${error.max}文字以内で入力してください`;
    case "FORBIDDEN_CHAR":
      return `使用できない文字が含まれています: ${error.chars.join(" ")}`;
    default: {
      error satisfies never;
      return "";
    }
  }
};
