import { useMemo } from "react";
import { SubIssue } from "@/features/detail/domains/sub-issue";
import type { Column, Task } from "@/types/task";

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
  /** 完了として扱うカラム名（解決済み） */
  effectiveDoneColumn: string;
};

/**
 * 親タスクの子タスク一覧と完了カラム名を解決する hook。
 * SubIssue ドメインの純粋関数を useMemo で配線するだけの薄い橋渡し。
 * @param args - 親ファイルパス・全タスク・カラム・doneColumn
 * @returns 子タスクと完了カラム名
 */
export const useChildTasks = (args: UseChildTasksArgs): UseChildTasksResult => {
  const { parentFilePath, allTasks, columns, doneColumn } = args;
  const childTasks = useMemo(
    () => SubIssue.filter(allTasks, parentFilePath),
    [allTasks, parentFilePath],
  );
  const effectiveDoneColumn = useMemo(
    () => SubIssue.resolveDoneColumn(columns, doneColumn),
    [columns, doneColumn],
  );
  return { childTasks, effectiveDoneColumn };
};
