import {
  Task,
  type TaskFilePath,
  type TaskId,
  type TaskWarning,
  type TaskWarningCode,
} from "@/types/task";

type TaskFixtureOverrides = Partial<
  Omit<Task, "id" | "filePath" | "links" | "hierarchy">
> & {
  id: string;
  filePath?: string;
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
export const makeTask = (overrides: TaskFixtureOverrides): Task =>
  Task.fromPayload({
    id: overrides.id,
    title: overrides.title ?? "t",
    status: overrides.status ?? "Todo",
    labels: overrides.labels ?? [],
    body: overrides.body ?? "",
    filePath: overrides.filePath ?? `tasks/${overrides.id}.md`,
    priority: overrides.priority,
    draft: overrides.draft ?? false,
    extras: overrides.extras ?? {},
    warnings: overrides.warnings ?? [],
    parent: overrides.parent,
    links: overrides.links ?? [],
    children: overrides.children ?? [],
    reverseLinks: overrides.reverseLinks ?? [],
  });

/**
 * raw payload の task ID をテスト用domain IDへ変換する。
 * @param id wire fixtureのtask ID
 * @returns `Task.fromPayload`境界を通過したtask ID
 */
export const taskIdFixture = (id: string): TaskId => makeTask({ id }).id;

/**
 * raw payload のfile pathをテスト用canonical pathへ変換する。
 * @param filePath wire fixtureのfile path
 * @returns `Task.fromPayload`境界を通過したcanonical file path
 */
export const taskFilePathFixture = (filePath: string): TaskFilePath =>
  makeTask({ id: filePath, filePath }).filePath;

/**
 * テスト用に単一 warning code を持つ `TaskWarning` を生成するファクトリ。
 * @param code warning code
 * @returns 当該 code のダミー `TaskWarning`
 */
export const warn = (code: TaskWarningCode): TaskWarning => ({
  code,
  message: `dummy message for ${code}`,
});
