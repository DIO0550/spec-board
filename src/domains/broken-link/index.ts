import {
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type { Task } from "@/types/task";

/**
 * 1 タスクの 4 種参照（parent / links / children / reverseLinks）について
 * どれが「リンク切れ」（参照先 Task が一覧に存在しない）かを保持する集合。
 * - `parent`: true ならリンク切れ
 * - `links` / `children` / `reverseLinks`: broken 判定された raw ref 文字列の集合
 */
export type BrokenLinkSet = {
  readonly parent: boolean;
  readonly links: ReadonlySet<string>;
  readonly children: ReadonlySet<string>;
  readonly reverseLinks: ReadonlySet<string>;
};

/**
 * タスク配列から「正規化済み path → Task」の lookup Map を構築する。
 * @param tasks - 母集団のタスク配列
 * @returns 正規化済み Task.filePath を key とする lookup Map
 */
export const buildTasksByNormalizedPath = (
  tasks: readonly Task[],
): ReadonlyMap<string, Task> => {
  const map = new Map<string, Task>();
  for (const task of tasks) {
    map.set(normalizeTaskPathForLookup(task.filePath), task);
  }
  return map;
};

/**
 * 単一の ref 文字列が「リンク切れ」かを判定する。
 * 空文字 / 絶対 path / Windows drive prefix のように normalize で undefined を返す ref は
 * broken 扱い（`parentReferencesTaskPath` / `linkReferencesTaskPath` と同 semantics）。
 * @param ref - 参照 path 文字列
 * @param tasksByNormalizedPath - {@link buildTasksByNormalizedPath} で構築した lookup Map
 * @returns 参照先が見つからなければ true
 */
export const isBrokenLink = (
  ref: string,
  tasksByNormalizedPath: ReadonlyMap<string, Task>,
): boolean => {
  const normalized = normalizeRefPathForLookup(ref);
  if (normalized === undefined) {
    return true;
  }
  return !tasksByNormalizedPath.has(normalized);
};

/**
 * 与えられた ref 配列のうち broken なものだけを残した Set を返す。
 * @param refs - 走査する ref 配列
 * @param tasksByNormalizedPath - lookup Map
 * @returns broken な ref の Set（raw 値）
 */
const collectBrokenRefs = (
  refs: readonly string[],
  tasksByNormalizedPath: ReadonlyMap<string, Task>,
): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const ref of refs) {
    if (isBrokenLink(ref, tasksByNormalizedPath)) {
      out.add(ref);
    }
  }
  return out;
};

/**
 * 1 タスクの 4 種参照に対する broken link 判定をまとめて返す。
 * @param task - 判定対象タスク
 * @param tasksByNormalizedPath - lookup Map
 * @returns 4 種それぞれの broken 判定集合
 */
export const getBrokenLinks = (
  task: Task,
  tasksByNormalizedPath: ReadonlyMap<string, Task>,
): BrokenLinkSet => {
  const parentRef = task.hierarchy.parentFilePath;
  const parentBroken =
    parentRef !== undefined && isBrokenLink(parentRef, tasksByNormalizedPath);

  return {
    parent: parentBroken,
    links: collectBrokenRefs(task.links.linkedFilePaths, tasksByNormalizedPath),
    children: collectBrokenRefs(
      task.hierarchy.childFilePaths,
      tasksByNormalizedPath,
    ),
    reverseLinks: collectBrokenRefs(
      task.links.reverseLinkedFilePaths,
      tasksByNormalizedPath,
    ),
  };
};

/**
 * タスクに 1 件でも broken link が含まれているかを返す。
 * TaskCard の警告アイコン表示判定に使用する。
 * @param task - 判定対象タスク
 * @param tasksByNormalizedPath - lookup Map
 * @returns 1 件以上 broken なら true
 */
export const hasAnyBrokenLink = (
  task: Task,
  tasksByNormalizedPath: ReadonlyMap<string, Task>,
): boolean => {
  const s = getBrokenLinks(task, tasksByNormalizedPath);
  return (
    s.parent ||
    s.links.size > 0 ||
    s.children.size > 0 ||
    s.reverseLinks.size > 0
  );
};

/**
 * 「broken link を 1 件でも持つタスク」の総数を返す。
 * 1 タスクが複数種類の broken link を持っていてもカウントは 1。
 * Toast 通知の「リンク切れが N 件あります」用。
 * @param tasks - 走査対象のタスク配列
 * @param tasksByNormalizedPath - lookup Map
 * @returns broken link を持つタスクの件数
 */
export const countTasksWithBrokenLink = (
  tasks: readonly Task[],
  tasksByNormalizedPath: ReadonlyMap<string, Task>,
): number => {
  let count = 0;
  for (const task of tasks) {
    if (hasAnyBrokenLink(task, tasksByNormalizedPath)) {
      count += 1;
    }
  }
  return count;
};
