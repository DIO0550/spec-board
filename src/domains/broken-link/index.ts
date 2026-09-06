import { TaskPathLookup } from "@/domains/task-path-lookup";
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
 * 4 種いずれも broken なしを意味する empty `BrokenLinkSet`。固定参照として共有する。
 *
 * `Object.freeze` が防ぐのは外側オブジェクトのプロパティ再代入のみ。
 * `Set` は内部スロットで値を持つため `Object.freeze(new Set())` でも `.add()` は通る。
 * 中身の書き換え防止は型側の `ReadonlySet` に委ねている。
 */
const EMPTY: BrokenLinkSet = Object.freeze({
  parent: false,
  links: new Set<string>(),
  children: new Set<string>(),
  reverseLinks: new Set<string>(),
});

/**
 * 与えられた raw ref 配列のうち broken なものだけを残した Set を返す。
 * @param refs - 対象 ref 配列
 * @param lookup - 参照先 Task を引く lookup
 * @returns broken な ref の Set（raw 値のまま保持する）
 */
const collectBroken = (
  refs: readonly string[],
  lookup: TaskPathLookup,
): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const ref of refs) {
    if (!TaskPathLookup.hasRef(lookup, ref)) {
      out.add(ref);
    }
  }
  return out;
};

export const BrokenLinkSet = {
  /** 4 種いずれも broken なしを意味する固定参照の empty 値。 */
  empty: EMPTY,

  /**
   * 単一の ref 文字列が「リンク切れ」かを判定する。
   * 空文字 / 絶対 path / Windows drive prefix のように正規化できない ref は broken 扱い。
   * @param ref - 参照 path 文字列
   * @param lookup - 参照先 Task を引く lookup
   * @returns 参照先が見つからなければ true
   */
  isBroken: (ref: string, lookup: TaskPathLookup): boolean =>
    !TaskPathLookup.hasRef(lookup, ref),

  /**
   * 1 タスクの 4 種参照に対する broken link 判定をまとめて返す。
   * `lookup` が未指定の場合は {@link BrokenLinkSet.empty} を返す（呼出元での fallback を不要にする）。
   * @param task - 判定対象タスク
   * @param lookup - lookup（未指定で broken 判定をスキップ）
   * @returns 4 種それぞれの broken 判定集合
   */
  from: (task: Task, lookup: TaskPathLookup | undefined): BrokenLinkSet => {
    if (lookup === undefined) {
      return EMPTY;
    }
    const parentRef = task.hierarchy.parentFilePath;
    return {
      parent:
        parentRef !== undefined && BrokenLinkSet.isBroken(parentRef, lookup),
      links: collectBroken(task.links.linkedFilePaths, lookup),
      children: collectBroken(task.hierarchy.childFilePaths, lookup),
      reverseLinks: collectBroken(task.links.reverseLinkedFilePaths, lookup),
    };
  },

  /**
   * タスクに 1 件でも broken link が含まれているかを返す。
   * TaskCard の警告アイコン表示判定に使用する。
   *
   * `from` 経由ではなく各 ref 配列を `some(isBroken)` で短絡評価する。
   * Board/Column 側でタスク数分繰り返されるため、不要な Set 割り当てを避けてコストを抑える。
   * @param task - 判定対象タスク
   * @param lookup - lookup
   * @returns 1 件以上 broken なら true
   */
  hasAny: (task: Task, lookup: TaskPathLookup): boolean => {
    /**
     * `lookup` を bind した単一 ref 用の判定 helper。
     * @param ref 判定対象 raw ref
     * @returns broken なら true
     */
    const isBroken = (ref: string): boolean =>
      BrokenLinkSet.isBroken(ref, lookup);
    const parentRef = task.hierarchy.parentFilePath;
    return (
      (parentRef !== undefined && isBroken(parentRef)) ||
      task.links.linkedFilePaths.some(isBroken) ||
      task.hierarchy.childFilePaths.some(isBroken) ||
      task.links.reverseLinkedFilePaths.some(isBroken)
    );
  },

  /**
   * 「broken link を 1 件でも持つタスク」の総数を返す。
   * 1 タスクが複数種類の broken link を持っていてもカウントは 1。
   * Toast 通知の「リンク切れが N 件あります」用。
   * @param tasks - 走査対象のタスク配列
   * @param lookup - lookup
   * @returns broken link を持つタスクの件数
   */
  countTasks: (tasks: readonly Task[], lookup: TaskPathLookup): number => {
    let count = 0;
    for (const task of tasks) {
      if (BrokenLinkSet.hasAny(task, lookup)) {
        count += 1;
      }
    }
    return count;
  },
} as const;
