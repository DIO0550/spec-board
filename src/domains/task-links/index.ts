import type { Task } from "@/types/task";

/** Task の関連リンク情報 */
export type TaskLinks = {
  /** 関連タスクのファイルパスの配列 */
  links: string[];
  /** 逆方向リンクのファイルパスの配列（links から逆引き） */
  reverseLinks: string[];
};

const removePath = (paths: string[], filePath: string): string[] => {
  if (!paths.includes(filePath)) {
    return paths;
  }

  return paths.filter((path) => path !== filePath);
};

const removeLinkedPath = (
  taskLinks: TaskLinks,
  linkedFilePath: string,
): TaskLinks => ({
  links: removePath(taskLinks.links, linkedFilePath),
  reverseLinks: removePath(taskLinks.reverseLinks, linkedFilePath),
});

const hasLinkChanges = (current: TaskLinks, next: TaskLinks): boolean =>
  next.links !== current.links || next.reverseLinks !== current.reverseLinks;

export const TaskLinks = {
  /**
   * Task の関連 link 関係から指定 task への参照を取り除く。
   *
   * @param task link 関係を掃除する task
   * @param linkedFilePath 取り除く関連 task の filePath
   * @returns link 関係が変われば更新後 task、変わらなければ元 task
   */
  removeLinkedTask: (task: Task, linkedFilePath: string): Task => {
    const taskLinks = removeLinkedPath(task, linkedFilePath);

    if (!hasLinkChanges(task, taskLinks)) {
      return task;
    }

    return { ...task, ...taskLinks };
  },
} as const;
