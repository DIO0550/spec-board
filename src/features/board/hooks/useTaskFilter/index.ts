import { useCallback, useMemo, useState } from "react";
import type { Task } from "@/types/task";
import {
  applyTaskFilter,
  EMPTY_TASK_FILTER,
  isTaskFilterActive,
  type TaskFilterCriteria,
} from "../../lib/applyTaskFilter";

/** useTaskFilter の返り値。 */
export type UseTaskFilterResult = {
  /** 現在の絞り込み条件 */
  criteria: TaskFilterCriteria;
  /**
   * 絞り込み条件を更新する。
   * @param next - 新しい条件
   */
  setCriteria: (next: TaskFilterCriteria) => void;
  /** 条件をすべて初期化する。 */
  clear: () => void;
  /** 条件適用後のタスク一覧 */
  filtered: Task[];
  /** いずれかの条件が有効か */
  isActive: boolean;
};

/**
 * ボード上のタスクを検索キーワード / ラベル / 優先度 / ステータス / マイルストーンで
 * 横断的に絞り込むフィルタ state。board の全ビュー（board / list / tree / calendar）で共有する。
 * @param tasks - 絞り込み対象のタスク一覧
 * @returns 絞り込み state と結果
 */
export const useTaskFilter = (tasks: Task[]): UseTaskFilterResult => {
  const [criteria, setCriteria] =
    useState<TaskFilterCriteria>(EMPTY_TASK_FILTER);

  const clear = useCallback(() => {
    setCriteria(EMPTY_TASK_FILTER);
  }, []);

  const filtered = useMemo(
    () => applyTaskFilter(tasks, criteria),
    [tasks, criteria],
  );

  const isActive = useMemo(() => isTaskFilterActive(criteria), [criteria]);

  return { criteria, setCriteria, clear, filtered, isActive };
};
