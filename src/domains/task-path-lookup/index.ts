import {
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type { Task } from "@/types/task";

/**
 * 正規化済み `Task.filePath`（`normalizeTaskPathForLookup` 適用後）を key とする Task lookup。
 *
 * `@/domains/task-projection` の `TaskProjectionMap` は BE が返した **raw な filePath** を
 * key にしており基準が異なる。両者を取り違えると無言で lookup が外れるため、
 * 生の `ReadonlyMap<string, Task>` ではなくこの型名で受け渡す。
 *
 * 空の lookup は「全参照が broken」と同義になるため、未取得状態の代替として
 * 空 Map を渡してはならない（`empty` を意図的に提供していない）。
 */
export type TaskPathLookup = ReadonlyMap<string, Task>;

export const TaskPathLookup = {
  /**
   * タスク配列から「正規化済み path → Task」の lookup を構築する。
   * 同一の正規化 key を持つタスクが複数ある場合は後勝ちになる。
   * @param tasks - 母集団のタスク配列
   * @returns 正規化済み `Task.filePath` を key とする lookup
   */
  fromTasks: (tasks: readonly Task[]): TaskPathLookup => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      map.set(normalizeTaskPathForLookup(task.filePath), task);
    }
    return map;
  },

  /**
   * 参照 path 文字列を正規化して Task を引き当てる。
   * 空文字 / 絶対 path / Windows drive prefix のように正規化が `undefined` を返す ref は
   * 「未登録」と同じく `undefined` を返す。
   * @param lookup - {@link TaskPathLookup.fromTasks} で構築した lookup
   * @param ref - 参照 path 文字列（parent / links / children / reverseLinks の raw 値）
   * @returns 該当 Task、引き当てられなければ `undefined`
   */
  findByRef: (lookup: TaskPathLookup, ref: string): Task | undefined => {
    const normalized = normalizeRefPathForLookup(ref);
    if (normalized === undefined) {
      return undefined;
    }
    return lookup.get(normalized);
  },

  /**
   * 参照 path 文字列に対応する Task が lookup に存在するかを返す。
   * @param lookup - {@link TaskPathLookup.fromTasks} で構築した lookup
   * @param ref - 参照 path 文字列
   * @returns 引き当てられれば true
   */
  hasRef: (lookup: TaskPathLookup, ref: string): boolean =>
    TaskPathLookup.findByRef(lookup, ref) !== undefined,
} as const;
