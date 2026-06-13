import { useMemo } from "react";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import { SubIssue } from "@/features/detail/domains/sub-issue";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

/** useChildTasks の引数 */
export type UseChildTasksArgs = {
  /** 親タスクのファイルパス */
  parentFilePath: string;
  /** 全タスク一覧（未指定なら空配列扱い） */
  allTasks?: readonly Task[];
  /** カラム一覧（doneColumn フォールバック計算用） */
  columns: readonly Column[];
  /** 明示的な完了カラム名（任意） */
  doneColumn?: string;
};

/** useChildTasks の戻り値 */
export type UseChildTasksResult = {
  /** 直接の子タスク */
  childTasks: readonly Task[];
  /** 全子孫タスク（再帰展開済、root 自身は含まない） */
  descendantTasks: readonly Task[];
  /** 完了として扱うカラム名（解決済み） */
  effectiveDoneColumn: string;
};

const EMPTY_TASKS: readonly Task[] = [];

/**
 * 親タスクの子タスク一覧と完了カラム名を解決する hook。
 * SubIssue ドメインの純粋関数を useMemo で配線するだけの薄い橋渡し。
 *
 * `childTasks` / `descendantTasks` / `effectiveDoneColumn` は独立した useMemo で
 * メモ化しており、`columns` / `doneColumn` の変更だけでは `descendantTasks` の
 * 再計算は走らない。
 *
 * hook 化を維持する理由: 戻り値 `UseChildTasksResult` を `PropertiesSidebar` の
 * prop 型として共有し、3 つの派生値（直下子 / 全子孫 / 完了カラム）と各々の
 * メモ化境界を 1 つの公開 API にまとめて component 境界をまたいで渡している。
 * 単一コンポーネント内の useMemo へ展開すると、この共有 ViewModel と独立した
 * メモ化境界が分散するため hook に残す。
 * @param args - 親ファイルパス・全タスク・カラム・doneColumn
 * @returns 直下子・全子孫・完了カラム名
 */
export const useChildTasks = (args: UseChildTasksArgs): UseChildTasksResult => {
  const { parentFilePath, allTasks, columns, doneColumn } = args;
  const childTasks = useMemo(
    () => SubIssue.filter(allTasks, parentFilePath),
    [allTasks, parentFilePath],
  );
  const descendantTasks = useMemo(() => {
    if (allTasks === undefined) {
      return EMPTY_TASKS;
    }
    return TaskHierarchy.collectDescendants(allTasks, parentFilePath);
  }, [allTasks, parentFilePath]);
  const effectiveDoneColumn = useMemo(
    () => SubIssue.resolveDoneColumn(columns, doneColumn),
    [columns, doneColumn],
  );
  return { childTasks, descendantTasks, effectiveDoneColumn };
};
