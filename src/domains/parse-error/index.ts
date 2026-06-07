import type { Task, TaskWarningCode } from "@/types/task";

/**
 * 「パースエラー」とみなす invalid 系 warning code の集合。
 * parentCycle（循環バナーで別扱い）/ parentNotFound / missing* 系（リンク切れ・別カテゴリ）は含めない。
 */
const PARSE_ERROR_CODES: ReadonlySet<TaskWarningCode> = new Set([
  "invalidTitleUsedFileName",
  "invalidStatusUsedDefault",
  "invalidParentIgnored",
  "nonStringExtraKeyIgnored",
  "extraValueNotJsonCompatible",
]);

/**
 * タスクが 1 件でもパースエラー warning を持つかを返す。
 * カードの赤アイコン / 詳細（DetailScreen）の赤バナー表示判定に使用する。
 * @param task - 判定対象タスク
 * @returns invalid 系コードを 1 つでも含めば true
 */
export const hasParseError = (task: Task): boolean =>
  task.warnings.some((w) => PARSE_ERROR_CODES.has(w.code));

/**
 * 「パースエラーを 1 件でも持つタスク」の総数を返す。
 * 1 タスクが複数 invalid コードを持ってもカウントは 1。ロード時 Toast 用。
 * @param tasks - 走査対象のタスク配列
 * @returns パースエラーを持つタスクの件数
 */
export const countTasksWithParseError = (tasks: readonly Task[]): number =>
  tasks.filter(hasParseError).length;
