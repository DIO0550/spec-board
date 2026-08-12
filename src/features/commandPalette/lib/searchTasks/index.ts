import type { Task } from "@/types/task";

export type TaskSearchEntry = {
  task: Task;
  searchText: string;
};

/** @param tasks - 検索対象 @returns 正規化済み検索索引 */
export const createTaskSearchIndex = (
  tasks: readonly Task[],
): TaskSearchEntry[] =>
  tasks.map((task) => ({
    task,
    searchText: [task.title, task.id, task.filePath, ...task.labels]
      .join("\n")
      .toLocaleLowerCase(),
  }));

/** @param entries - 検索索引 @param query - 入力語 @returns 一致するタスク */
export const searchTaskIndex = (
  entries: readonly TaskSearchEntry[],
  query: string,
): Task[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === "") {
    return entries.map(({ task }) => task);
  }
  return entries.flatMap((entry) =>
    entry.searchText.includes(normalized) ? [entry.task] : [],
  );
};

/** @param tasks - 検索対象 @param query - 入力語 @returns 一致するタスク */
export const searchTasks = (tasks: readonly Task[], query: string): Task[] => {
  return searchTaskIndex(createTaskSearchIndex(tasks), query);
};
