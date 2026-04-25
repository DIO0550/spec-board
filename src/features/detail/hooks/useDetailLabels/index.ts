import { useCallback, useRef } from "react";
import { Labels } from "@/features/detail/domains/label";
import type { Task } from "@/types/task";

/** useDetailLabels の引数 */
export type UseDetailLabelsArgs = {
  /** 対象タスク */
  task: Task;
  /**
   * タスク更新コールバック
   * @param id - タスク ID
   * @param updates - 更新フィールド
   */
  onTaskUpdate: (id: string, updates: Partial<Omit<Task, "id">>) => void;
};

/** useDetailLabels の戻り値 */
export type UseDetailLabelsResult = {
  /**
   * ラベルを追加する。trim/重複は domain に委譲。
   * @param label - 追加するラベル名（trim 済み前提だが domain が再 trim）
   */
  add: (label: string) => void;
  /**
   * ラベルを削除する。
   * @param label - 削除するラベル名
   */
  remove: (label: string) => void;
};

/**
 * DetailPanel 側でラベル更新の橋渡しを行う hook。
 * latestLabelsRef を render 中代入で同期し、同フレーム連続発火を合算する。
 *
 * @param args - 対象タスクと onTaskUpdate コールバック
 * @returns add / remove ハンドラ
 */
export const useDetailLabels = (
  args: UseDetailLabelsArgs,
): UseDetailLabelsResult => {
  const { task, onTaskUpdate } = args;
  const latestLabelsRef = useRef<readonly string[]>(task.labels);
  latestLabelsRef.current = task.labels;

  const add = useCallback(
    (label: string) => {
      const next = Labels.tryAdd(latestLabelsRef.current, label);
      if (next === null) return;
      latestLabelsRef.current = next;
      onTaskUpdate(task.id, { labels: [...next] });
    },
    [task.id, onTaskUpdate],
  );

  const remove = useCallback(
    (label: string) => {
      const next = Labels.removeFrom(latestLabelsRef.current, label);
      latestLabelsRef.current = next;
      onTaskUpdate(task.id, { labels: [...next] });
    },
    [task.id, onTaskUpdate],
  );

  return { add, remove };
};
