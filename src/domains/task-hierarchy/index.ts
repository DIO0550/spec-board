import { parentReferencesTaskPath } from "@/domains/task-path";
import type { Task, TaskFilePath } from "@/types/task";

/** Task の親子階層情報 */
export type TaskHierarchy = {
  /** 親タスクのファイルパス（親がない場合は未設定） */
  parentFilePath?: string;
  /** 子タスクのファイルパスの配列（parent から逆引き） */
  childFilePaths: TaskFilePath[];
};

/**
 * `children` から指定 path を除いた配列を返す。含まれていなければ元配列をそのまま返す。
 * @param children 元の child filePath 配列
 * @param filePath 除去対象の path
 * @returns 除去後の配列
 */
const removeChild = (
  children: TaskFilePath[],
  filePath: TaskFilePath,
): TaskFilePath[] => {
  if (!children.includes(filePath)) {
    return children;
  }

  return children.filter((child) => child !== filePath);
};

/**
 * `parent` 参照が `filePath` を指していれば剥がして undefined を返す。
 * @param parent 現在の parentFilePath
 * @param filePath 比較対象の path
 * @returns 参照が外れた後の parentFilePath
 */
const detachParent = (
  parent: string | undefined,
  filePath: string,
): string | undefined => {
  if (!parentReferencesTaskPath(parent, filePath)) {
    return parent;
  }

  return undefined;
};

/**
 * 階層情報から削除済み path への parent / child 参照を剥がした `TaskHierarchy` を返す。
 * @param hierarchy 元の階層情報
 * @param deletedFilePath 削除済み task の filePath
 * @returns 参照を剥がした後の階層情報
 */
const detachDeletedPath = (
  hierarchy: TaskHierarchy,
  deletedFilePath: TaskFilePath,
): TaskHierarchy => ({
  parentFilePath: detachParent(hierarchy.parentFilePath, deletedFilePath),
  childFilePaths: removeChild(hierarchy.childFilePaths, deletedFilePath),
});

/**
 * 2 つの `TaskHierarchy` で参照が変わっているか判定する。
 * @param current 変更前の階層情報
 * @param next 変更後の階層情報
 * @returns parent/children のいずれかが変わっていれば true
 */
const hasHierarchyChanges = (
  current: TaskHierarchy,
  next: TaskHierarchy,
): boolean =>
  next.parentFilePath !== current.parentFilePath ||
  next.childFilePaths !== current.childFilePaths;

export const TaskHierarchy = {
  /**
   * Task の親子階層から削除済み task への参照を取り除く。
   *
   * @param task 階層関係を掃除する task
   * @param deletedFilePath 削除済み task の filePath
   * @returns 階層関係が変われば更新後 task、変わらなければ元 task
   */
  detachDeletedTask: (task: Task, deletedFilePath: TaskFilePath): Task => {
    const hierarchy = detachDeletedPath(task.hierarchy, deletedFilePath);

    if (!hasHierarchyChanges(task.hierarchy, hierarchy)) {
      return task;
    }

    return { ...task, hierarchy };
  },
} as const;
