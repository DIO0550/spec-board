import { useMemo } from "react";
import type { Task } from "@/domains/task";
import { parentReferencesTaskPath } from "@/domains/task-path";

/** useParentTask の引数 */
export type UseParentTaskArgs = {
  /** 現在表示中のタスク */
  task: Task;
  /** 全タスク一覧（読込中など未指定可） */
  allTasks?: readonly Task[];
};

/** useParentTask の戻り値 */
export type UseParentTaskResult = {
  /** 親タスク（存在しない / 孤児参照 / allTasks 未指定のとき null） */
  parentTask: Task | null;
};

/**
 * 現在のタスクの親タスクを allTasks から lookup する hook。
 * path 比較は parentReferencesTaskPath に委譲し、表記揺れを吸収する。
 *
 * hook 化を維持する理由: 親解決には allTasks の線形探索 + path 表記揺れの吸収が
 * 絡むため、戻り値 `UseParentTaskResult` として component から切り離し、
 * useChildTasks と並ぶ「詳細パネルの派生 ViewModel 取得」の一貫した形を保つ。
 * @param args - 現在タスクと全タスク
 * @returns 親タスク（無ければ null）
 */
export const useParentTask = (args: UseParentTaskArgs): UseParentTaskResult => {
  const { task, allTasks } = args;

  const parentTask = useMemo<Task | null>(() => {
    const parentRef = task.hierarchy.parentFilePath;
    if (!parentRef) {
      return null;
    }
    if (!allTasks) {
      return null;
    }
    const found = allTasks.find((candidate) =>
      parentReferencesTaskPath(parentRef, candidate.filePath),
    );
    return found ?? null;
  }, [task.hierarchy.parentFilePath, allTasks]);

  return { parentTask };
};
