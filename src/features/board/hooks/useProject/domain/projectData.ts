import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { ColumnsCommand } from "./columns";

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
  renames: NonNullable<ColumnsCommand["renames"]>,
): Task[] => {
  return renames.reduce<Task[]>(
    (acc, { from, to }) =>
      acc.map((task) =>
        task.status === from ? { ...task, status: to } : task,
      ),
    tasks,
  );
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
    const parentFilePath = task.parent;
    const tasksWithParentSync =
      parentFilePath === undefined
        ? tasksWithCreated
        : tasksWithCreated.map((current) =>
            current.filePath === parentFilePath &&
            !current.children.includes(task.filePath)
              ? { ...current, children: [...current.children, task.filePath] }
              : current,
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
   * @param command 適用する column 更新命令
   * @returns column 更新後の ProjectData
   */
  replaceColumns: (data: ProjectData, command: ColumnsCommand): ProjectData => {
    const renamed = applyRenamesToTasks(data.tasks, command.renames ?? []);
    const renameMap = new Map(
      (command.renames ?? []).map(({ from, to }) => [from, to]),
    );
    const followedDone =
      data.doneColumn !== undefined
        ? (renameMap.get(data.doneColumn) ?? data.doneColumn)
        : undefined;
    return {
      ...data,
      tasks: renamed,
      columns: command.columns,
      doneColumn: command.doneColumn ?? followedDone,
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
