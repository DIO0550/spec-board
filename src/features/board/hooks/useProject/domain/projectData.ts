import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { UpdateColumnsCommand } from "./columns";

export type ProjectData = {
  tasks: Task[];
  columns: Column[];
  doneColumn?: string;
};

const applyRenamesToTasks = (
  tasks: Task[],
  renames: NonNullable<UpdateColumnsCommand["renames"]>,
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

  replaceColumns: (
    data: ProjectData,
    command: UpdateColumnsCommand,
  ): ProjectData => {
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

  refreshDoneColumn: (data: ProjectData, doneColumn: string): ProjectData => ({
    ...data,
    doneColumn,
  }),
} as const;
