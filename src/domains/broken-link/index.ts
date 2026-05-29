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

/** 4 種いずれも broken なしを意味する empty `BrokenLinkSet`。`undefined` map 時の戻り値として共有する（実体は通常の `Set` で freeze はされていないが、呼出元は読み取りのみで使う前提）。 */
const EMPTY_BROKEN_LINK_SET: BrokenLinkSet = {
  parent: false,
  links: new Set<string>(),
  children: new Set<string>(),
  reverseLinks: new Set<string>(),
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
 * 1 タスクの 4 種参照に対する broken link 判定をまとめて返す。
 * `tasksByNormalizedPath` が未指定の場合は全 set が empty の {@link BrokenLinkSet} を返す
 * （呼出元での fallback を不要にする）。
 * @param task - 判定対象タスク
 * @param tasksByNormalizedPath - lookup Map（未指定で broken 判定をスキップ）
 * @returns 4 種それぞれの broken 判定集合
 */
export const getBrokenLinks = (
  task: Task,
  tasksByNormalizedPath: ReadonlyMap<string, Task> | undefined,
): BrokenLinkSet => {
  if (tasksByNormalizedPath === undefined) {
    return EMPTY_BROKEN_LINK_SET;
  }
  /**
   * 与えられた raw ref 配列のうち broken なものだけを残した Set を返すローカル helper。
   * @param refs 対象 ref 配列
   * @returns broken な ref の Set（raw 値）
   */
  const collect = (refs: readonly string[]): ReadonlySet<string> => {
    const out = new Set<string>();
    for (const ref of refs) {
      if (isBrokenLink(ref, tasksByNormalizedPath)) {
        out.add(ref);
      }
    }
    return out;
  };
  const parentRef = task.hierarchy.parentFilePath;
  return {
    parent:
      parentRef !== undefined && isBrokenLink(parentRef, tasksByNormalizedPath),
    links: collect(task.links.linkedFilePaths),
    children: collect(task.hierarchy.childFilePaths),
    reverseLinks: collect(task.links.reverseLinkedFilePaths),
  };
};

/**
 * タスクに 1 件でも broken link が含まれているかを返す。
 * TaskCard の警告アイコン表示判定に使用する。
 *
 * `getBrokenLinks` 経由ではなく各 ref 配列を `some(isBrokenLink)` で短絡評価する。
 * Board/Column 側でタスク数分繰り返されるため、不要な Set 割り当てを避けてコストを抑える。
 * @param task - 判定対象タスク
 * @param tasksByNormalizedPath - lookup Map
 * @returns 1 件以上 broken なら true
 */
export const hasAnyBrokenLink = (
  task: Task,
  tasksByNormalizedPath: ReadonlyMap<string, Task>,
): boolean => {
  /**
   * `tasksByNormalizedPath` を bind した単一 ref 用の判定 helper。
   * @param ref 判定対象 raw ref
   * @returns broken なら true
   */
  const isBroken = (ref: string): boolean =>
    isBrokenLink(ref, tasksByNormalizedPath);
  const parentRef = task.hierarchy.parentFilePath;
  return (
    (parentRef !== undefined && isBroken(parentRef)) ||
    task.links.linkedFilePaths.some(isBroken) ||
    task.hierarchy.childFilePaths.some(isBroken) ||
    task.links.reverseLinkedFilePaths.some(isBroken)
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
