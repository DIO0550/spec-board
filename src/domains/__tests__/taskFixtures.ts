import type { Task } from "@/types/task";

export const makeTask = (
  overrides: Partial<Task> & Pick<Task, "id">,
): Task => ({
  id: overrides.id,
  title: overrides.title ?? "t",
  status: overrides.status ?? "Todo",
  labels: overrides.labels ?? [],
  parent: overrides.parent,
  links: overrides.links ?? [],
  children: overrides.children ?? [],
  reverseLinks: overrides.reverseLinks ?? [],
  body: overrides.body ?? "",
  filePath: overrides.filePath ?? `tasks/${overrides.id}.md`,
  priority: overrides.priority,
});
