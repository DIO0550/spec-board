import type { Task, TaskWarning, TaskWarningCode } from "@/types/task";

type TaskFixtureOverrides = Partial<Omit<Task, "links" | "hierarchy">> &
  Pick<Task, "id"> & {
    parent?: string;
    links?: string[];
    children?: string[];
    reverseLinks?: string[];
  };

/**
 * テスト用に最小限のフィールドだけ指定して `Task` を生成するファクトリ。指定しないフィールドはダミー値で埋める。
 * @param overrides id 必須、その他任意の上書きフィールド
 * @returns 上書きを反映した `Task`
 */
export const makeTask = (overrides: TaskFixtureOverrides): Task => ({
  id: overrides.id,
  title: overrides.title ?? "t",
  status: overrides.status ?? "Todo",
  labels: overrides.labels ?? [],
  body: overrides.body ?? "",
  filePath: overrides.filePath ?? `tasks/${overrides.id}.md`,
  priority: overrides.priority,
  extras: overrides.extras ?? {},
  warnings: overrides.warnings ?? [],
  links: {
    linkedFilePaths: overrides.links ?? [],
    reverseLinkedFilePaths: overrides.reverseLinks ?? [],
  },
  hierarchy: {
    parentFilePath: overrides.parent,
    childFilePaths: overrides.children ?? [],
  },
});

/**
 * テスト用に単一 warning code を持つ `TaskWarning` を生成するファクトリ。
 * @param code warning code
 * @returns 当該 code のダミー `TaskWarning`
 */
export const warn = (code: TaskWarningCode): TaskWarning => ({
  code,
  message: `dummy message for ${code}`,
});
