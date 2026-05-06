import type { Task } from "@/types/task";

type TaskFixtureOverrides = Partial<Omit<Task, "links" | "hierarchy">> &
  Pick<Task, "id"> & {
    parent?: string;
    links?: string[];
    children?: string[];
    reverseLinks?: string[];
  };

export const makeTask = (
  overrides: TaskFixtureOverrides,
): Task => ({
  id: overrides.id,
  title: overrides.title ?? "t",
  status: overrides.status ?? "Todo",
  labels: overrides.labels ?? [],
  body: overrides.body ?? "",
  filePath: overrides.filePath ?? `tasks/${overrides.id}.md`,
  priority: overrides.priority,
  links: {
    linkedFilePaths: overrides.links ?? [],
    reverseLinkedFilePaths: overrides.reverseLinks ?? [],
  },
  hierarchy: {
    parentFilePath: overrides.parent,
    childFilePaths: overrides.children ?? [],
  },
});
