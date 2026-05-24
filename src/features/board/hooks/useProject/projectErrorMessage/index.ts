import type { ProjectError } from "../errors";

const HAS_CHILDREN_MESSAGE = "子タスクが存在するため削除できません";

/**
 * `ProjectError` から人間可読なメッセージを取り出す。
 * HAS_CHILDREN 分類は専用文言に翻訳する。
 *
 * @param err useProject から運ばれるエラー
 * @returns toast 等に出せる文字列
 */
export const projectErrorMessage = (err: ProjectError): string => {
  if (err.kind === "tauri") {
    if (err.error.code === "HAS_CHILDREN") {
      return HAS_CHILDREN_MESSAGE;
    }
    return err.error.message;
  }
  return err.message;
};
