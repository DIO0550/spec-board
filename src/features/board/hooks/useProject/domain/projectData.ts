import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { ProjectColumnsChange } from "./projectColumns";

export type ProjectData = {
  tasks: Task[];
  columns: Column[];
  doneColumn?: string;
};

/**
 * task の status に column rename を適用する。
 *
 * @param tasks 対象 task 配列
 * @param renames 適用する column rename 一覧
 * @returns status を rename 済みの task 配列
 */
const applyRenamesToTasks = (
  tasks: Task[],
  renames: NonNullable<ProjectColumnsChange["renames"]>,
): Task[] => {
  return renames.reduce<Task[]>(
    (acc, { from, to }) =>
      acc.map((task) =>
        task.status === from ? { ...task, status: to } : task,
      ),
    tasks,
  );
};

/**
 * 親 task の children に作成された child task を追加する。
 *
 * @param tasks 作成済み child を含む task 配列
 * @param parentFilePath child task が参照する parent filePath
 * @param childFilePath 作成された child task の filePath
 * @returns parent が存在すれば children 同期後の task 配列
 */
const syncParentChildren = (
  tasks: Task[],
  parentFilePath: string | undefined,
  childFilePath: string,
): Task[] => {
  if (parentFilePath === undefined) {
    return tasks;
  }

  return tasks.map((current) => {
    if (
      current.filePath !== parentFilePath ||
      current.children.includes(childFilePath)
    ) {
      return current;
    }

    return { ...current, children: [...current.children, childFilePath] };
  });
};

export const ProjectData = {
  /**
   * 作成された task を追加し、親 task の children も同期する。
   *
   * @param data 現在の ProjectData
   * @param task 作成された task
   * @returns task 追加後の ProjectData
   */
  applyTaskCreated: (data: ProjectData, task: Task): ProjectData => {
    const tasksWithCreated = [...data.tasks, task];
    const tasksWithParentSync = syncParentChildren(
      tasksWithCreated,
      task.parent,
      task.filePath,
    );
    return { ...data, tasks: tasksWithParentSync };
  },

  /**
   * originalFilePath を lookup key として task を差し替える。
   *
   * @param data 現在の ProjectData
   * @param originalFilePath 更新前 task の filePath
   * @param task 更新後 task
   * @returns task 更新後の ProjectData
   */
  applyTaskUpdated: (
    data: ProjectData,
    originalFilePath: string,
    task: Task,
  ): ProjectData => ({
    ...data,
    tasks: data.tasks.map((current) =>
      current.filePath === originalFilePath ? task : current,
    ),
  }),

  /**
   * task を削除し、親子関係と link / reverseLink から参照を掃除する。
   *
   * @param data 現在の ProjectData
   * @param filePath 削除する task の filePath
   * @returns task 削除後の ProjectData
   */
  applyTaskDeleted: (data: ProjectData, filePath: string): ProjectData => {
    const tasks = data.tasks
      .filter((task) => task.filePath !== filePath)
      .map((task) => {
        const parent = task.parent === filePath ? undefined : task.parent;
        const children = task.children.includes(filePath)
          ? task.children.filter((child) => child !== filePath)
          : task.children;
        const links = task.links.includes(filePath)
          ? task.links.filter((link) => link !== filePath)
          : task.links;
        const reverseLinks = task.reverseLinks.includes(filePath)
          ? task.reverseLinks.filter((link) => link !== filePath)
          : task.reverseLinks;

        if (
          parent === task.parent &&
          children === task.children &&
          links === task.links &&
          reverseLinks === task.reverseLinks
        ) {
          return task;
        }
        return { ...task, parent, children, links, reverseLinks };
      });
    return { ...data, tasks };
  },

  /**
   * columns を置き換え、rename に応じて task status と doneColumn を追従する。
   *
   * @param data 現在の ProjectData
   * @param change 適用する column 変更
   * @returns column 更新後の ProjectData
   */
  replaceColumns: (
    data: ProjectData,
    change: ProjectColumnsChange,
  ): ProjectData => {
    const renamed = applyRenamesToTasks(data.tasks, change.renames ?? []);
    const renameMap = new Map(
      (change.renames ?? []).map(({ from, to }) => [from, to]),
    );
    const followedDone =
      data.doneColumn !== undefined
        ? (renameMap.get(data.doneColumn) ?? data.doneColumn)
        : undefined;
    return {
      ...data,
      tasks: renamed,
      columns: change.columns,
      doneColumn: change.doneColumn ?? followedDone,
    };
  },

  /**
   * backend から再取得した doneColumn を ProjectData に反映する。
   *
   * @param data 現在の ProjectData
   * @param doneColumn 再取得した doneColumn
   * @returns doneColumn 更新後の ProjectData
   */
  refreshDoneColumn: (data: ProjectData, doneColumn: string): ProjectData => ({
    ...data,
    doneColumn,
  }),
} as const;
