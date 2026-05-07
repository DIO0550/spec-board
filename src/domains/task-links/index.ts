import type { Task } from "@/types/task";

/** Task の関連リンク情報 */
export type TaskLinks = {
  /** 関連タスクのファイルパスの配列 */
  linkedFilePaths: string[];
  /** 逆方向リンクのファイルパスの配列（links から逆引き） */
  reverseLinkedFilePaths: string[];
};

/**
 * `paths` から `filePath` を除いた新しい配列を返す。含まれていなければ元配列をそのまま返す。
 * @param paths 元の path 配列
 * @param filePath 除去対象の path
 * @returns 除去後の path 配列
 */
const removePath = (paths: string[], filePath: string): string[] => {
  if (!paths.includes(filePath)) {
    return paths;
  }

  return paths.filter((path) => path !== filePath);
};

/**
 * link/reverseLink の両方から指定 path を取り除いた `TaskLinks` を返す。
 * @param taskLinks 元の link 状態
 * @param linkedFilePath 除去対象の path
 * @returns 除去後の `TaskLinks`
 */
const removeLinkedPath = (
  taskLinks: TaskLinks,
  linkedFilePath: string,
): TaskLinks => ({
  linkedFilePaths: removePath(taskLinks.linkedFilePaths, linkedFilePath),
  reverseLinkedFilePaths: removePath(
    taskLinks.reverseLinkedFilePaths,
    linkedFilePath,
  ),
});

/**
 * 2 つの `TaskLinks` で配列参照が変わっているか判定する。
 * @param current 変更前の link 状態
 * @param next 変更後の link 状態
 * @returns 参照が変わっていれば true
 */
const hasLinkChanges = (current: TaskLinks, next: TaskLinks): boolean =>
  next.linkedFilePaths !== current.linkedFilePaths ||
  next.reverseLinkedFilePaths !== current.reverseLinkedFilePaths;

export const TaskLinks = {
  /**
   * Task の関連 link 関係から指定 task への参照を取り除く。
   *
   * @param task link 関係を掃除する task
   * @param linkedFilePath 取り除く関連 task の filePath
   * @returns link 関係が変われば更新後 task、変わらなければ元 task
   */
  removeLinkedTask: (task: Task, linkedFilePath: string): Task => {
    const taskLinks = removeLinkedPath(task.links, linkedFilePath);

    if (!hasLinkChanges(task.links, taskLinks)) {
      return task;
    }

    return { ...task, links: taskLinks };
  },
} as const;
