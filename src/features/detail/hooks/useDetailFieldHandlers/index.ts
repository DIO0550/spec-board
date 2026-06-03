import { useCallback } from "react";
import type { Priority } from "@/domains/priority";
import { useDetailLabels } from "@/features/detail/hooks/useDetailLabels";
import type { Task } from "@/types/task";

/**
 * タスク更新コールバックの型。id と更新フィールドを受け取る。
 * @param id - 更新対象のタスク ID
 * @param updates - 更新するフィールド
 */
export type TaskUpdateHandler = (
  id: string,
  updates: Partial<Omit<Task, "id">>,
) => void;

/** 詳細フィールド編集の細粒度ハンドラ群 */
export type DetailFieldHandlers = {
  /**
   * ステータス変更ハンドラ。
   * @param status - 新しいステータス（カラム名）
   */
  onStatusChange: (status: string) => void;
  /**
   * 優先度変更ハンドラ。
   * @param priority - 新しい優先度（未設定は undefined）
   */
  onPriorityChange: (priority: Priority | undefined) => void;
  /**
   * ラベル追加ハンドラ。
   * @param label - 追加するラベル名
   */
  onLabelAdd: (label: string) => void;
  /**
   * ラベル削除ハンドラ。
   * @param label - 削除するラベル名
   */
  onLabelRemove: (label: string) => void;
};

/**
 * 詳細フィールド編集ハンドラを束ねる共有 hook。
 * `onTaskUpdate` を status/priority の細粒度ハンドラへ、`useDetailLabels` を
 * label 追加/削除ハンドラへ変換し、DetailPanel / DetailScreen で共有する。
 * これにより「onTaskUpdate → 細粒度ハンドラ + ラベル合算」の変換を両コンテナで
 * 重複実装しない。
 *
 * @param task - 対象タスク
 * @param onTaskUpdate - タスク更新コールバック
 * @returns 細粒度ハンドラ群（{@link DetailFieldHandlers}）
 */
export const useDetailFieldHandlers = (
  task: Task,
  onTaskUpdate: TaskUpdateHandler,
): DetailFieldHandlers => {
  const labels = useDetailLabels({ task, onTaskUpdate });

  const onStatusChange = useCallback(
    (status: string) => {
      onTaskUpdate(task.id, { status });
    },
    [task.id, onTaskUpdate],
  );

  const onPriorityChange = useCallback(
    (priority: Priority | undefined) => {
      onTaskUpdate(task.id, { priority });
    },
    [task.id, onTaskUpdate],
  );

  return {
    onStatusChange,
    onPriorityChange,
    onLabelAdd: labels.add,
    onLabelRemove: labels.remove,
  };
};
