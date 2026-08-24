import { useCallback, useMemo } from "react";
import {
  type SubIssueCounts,
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import type { Task, TaskFilePath } from "@/types/task";

/** useChildTasks の引数 */
export type UseChildTasksArgs = {
  /** 親タスクのファイルパス */
  parentFilePath: TaskFilePath;
  /** 全タスク一覧（未指定なら空配列扱い）。projection の filePath から実体を引くのに使う */
  allTasks?: readonly Task[];
  /**
   * filePath -> projection（BE 集計）。
   * **必須**（テスト / Storybook は `TaskProjection.emptyMap` を明示的に渡す）。
   */
  projections: TaskProjectionMap;
};

/** useChildTasks の戻り値 */
export type UseChildTasksResult = {
  /**
   * 直接の子タスク（BE projection の childFilePaths = `file_path` 昇順で解決済み）。
   *
   * 画面の行順は `SubIssueSection` が `parentTask.hierarchy.childFilePaths` から
   * 決めるため、この並びは表示に影響しない。
   */
  childTasks: readonly Task[];
  /** 全子孫の完了数 / 総数（BE projection 由来。未登録なら固定参照の 0/0） */
  subIssueCounts: SubIssueCounts;
  /**
   * 子タスクの完了判定（BE projection 由来）。
   * @param filePath - 判定対象 task の filePath
   * @returns 完了カラムに居れば true
   */
  isDone: (filePath: TaskFilePath) => boolean;
};

const EMPTY_TASKS: readonly Task[] = [];

/**
 * 親タスクの直下子・子孫進捗・完了判定を BE projection から解決する hook。
 *
 * 集計は BE（`TaskIndex::project_all`）の結果をそのまま使い、FE では DFS も
 * 完了カラム解決も行わない。
 *
 * Board 側（`TaskCardContextValue`）では projection map を capture した関数を
 * context に載せないが、ここでは `isDone` を返してよい。Board は N 枚のカードへ
 * 同じ値を配るため 1 エントリの変化で全カードの memo が落ちるのに対し、Detail は
 * 表示中の親 1 件に対して `SubIssueSection` 1 つが消費するだけで、関数参照が
 * 変わっても再レンダーがそのセクションに閉じるため。
 * @param args - 親ファイルパス・全タスク・projection
 * @returns 直下子・子孫進捗・完了判定
 */
export const useChildTasks = (args: UseChildTasksArgs): UseChildTasksResult => {
  const { parentFilePath, allTasks, projections } = args;

  const childTasks = useMemo(() => {
    if (allTasks === undefined) {
      return EMPTY_TASKS;
    }
    const byFilePath = new Map(allTasks.map((task) => [task.filePath, task]));
    const resolved = TaskProjection.findByFilePath(
      projections,
      parentFilePath,
    ).childFilePaths.flatMap((filePath) => {
      const task = byFilePath.get(filePath);
      return task === undefined ? [] : [task];
    });
    return resolved.length === 0 ? EMPTY_TASKS : resolved;
  }, [allTasks, projections, parentFilePath]);

  const subIssueCounts = useMemo(
    () =>
      TaskProjection.findByFilePath(projections, parentFilePath)
        .subIssueProgress,
    [projections, parentFilePath],
  );

  const isDone = useCallback(
    (filePath: TaskFilePath): boolean =>
      TaskProjection.findByFilePath(projections, filePath).isDone,
    [projections],
  );

  return { childTasks, subIssueCounts, isDone };
};
