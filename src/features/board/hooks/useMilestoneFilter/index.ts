import { useMemo, useState } from "react";
import type { Task } from "@/types/task";

/**
 * マイルストーンフィルタの選択状態。
 * 「未割当」を `string | null` では表現できないため判別可能 union にする。
 */
export type MilestoneFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "milestone"; name: string };

/** useMilestoneFilter の返り値。 */
export type UseMilestoneFilterResult = {
  /** 現在のフィルタ */
  filter: MilestoneFilter;
  /**
   * フィルタを更新する。
   * @param next - 新しいフィルタ
   */
  setFilter: (next: MilestoneFilter) => void;
  /** フィルタ適用後のタスク一覧 */
  filtered: Task[];
};

/**
 * タスクが指定フィルタに一致するかを判定する。
 * @param task - 判定対象タスク
 * @param filter - 現在のフィルタ
 * @returns 一致すれば true
 */
const matches = (task: Task, filter: MilestoneFilter): boolean => {
  if (filter.kind === "all") {
    return true;
  }
  if (filter.kind === "unassigned") {
    return task.milestone === undefined || task.milestone === "";
  }
  return task.milestone === filter.name;
};

/**
 * ボード上のタスクをマイルストーンで絞り込むフィルタ state（board feature 内に閉じる）。
 * @param tasks - 絞り込み対象のタスク一覧
 * @returns フィルタ state と絞り込み結果
 */
export const useMilestoneFilter = (tasks: Task[]): UseMilestoneFilterResult => {
  const [filter, setFilter] = useState<MilestoneFilter>({ kind: "all" });
  const filtered = useMemo(
    () => tasks.filter((task) => matches(task, filter)),
    [tasks, filter],
  );
  return { filter, setFilter, filtered };
};
