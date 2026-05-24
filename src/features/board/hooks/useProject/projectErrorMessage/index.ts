import type { ProjectError } from "../errors";

/**
 * `ProjectError` から人間可読なメッセージを取り出す。
 *
 * @param err useProject から運ばれるエラー
 * @returns toast 等に出せる文字列
 */
export const projectErrorMessage = (err: ProjectError): string => {
  if (err.kind === "tauri") {
    return err.error.message;
  }
  return err.message;
};
