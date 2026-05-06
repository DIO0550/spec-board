import { parentReferencesTaskPath } from "@/domains/task-path";
import type { Task } from "@/types/task";

/** Task の親子階層情報 */
export type TaskHierarchy = {
  /** 親タスクのファイルパス（親がない場合は未設定） */
  parent?: string;
  /** 子タスクのファイルパスの配列（parent から逆引き） */
  children: string[];
};

const removeChild = (children: string[], filePath: string): string[] => {
  if (!children.includes(filePath)) {
    return children;
  }

  return children.filter((child) => child !== filePath);
};

const detachParent = (
  parent: string | undefined,
  filePath: string,
): string | undefined => {
  if (!parentReferencesTaskPath(parent, filePath)) {
    return parent;
  }

  return undefined;
};

const detachDeletedPath = (
  hierarchy: TaskHierarchy,
  deletedFilePath: string,
): TaskHierarchy => ({
  parent: detachParent(hierarchy.parent, deletedFilePath),
  children: removeChild(hierarchy.children, deletedFilePath),
});

const hasHierarchyChanges = (
  current: TaskHierarchy,
  next: TaskHierarchy,
): boolean =>
  next.parent !== current.parent || next.children !== current.children;

export const TaskHierarchy = {
  /**
   * Task の親子階層から削除済み task への参照を取り除く。
   *
   * @param task 階層関係を掃除する task
   * @param deletedFilePath 削除済み task の filePath
   * @returns 階層関係が変われば更新後 task、変わらなければ元 task
   */
  detachDeletedTask: (task: Task, deletedFilePath: string): Task => {
    const hierarchy = detachDeletedPath(task, deletedFilePath);

    if (!hasHierarchyChanges(task, hierarchy)) {
      return task;
    }

    return { ...task, ...hierarchy };
  },
} as const;
