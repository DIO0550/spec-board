import { useCallback } from "react";
import type { Priority } from "@/domains/priority";
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
   * ラベル変更ハンドラ。選択集合を丸ごと受け取り差し替える（popover の onChange 用）。
   * @param labels - 変更後のラベル一覧
   */
  onLabelsChange: (labels: string[]) => void;
  /**
   * 下書きフラグ変更ハンドラ。false で下書き解除（frontmatter から draft キーを除去）。
   * @param draft - 新しい下書きフラグ
   */
  onChangeDraft: (draft: boolean) => void;
};

/**
 * 詳細フィールド編集ハンドラを束ねる共有 hook。
 * `onTaskUpdate` を status/priority/labels/draft の細粒度ハンドラへ変換し、DetailScreen で
 * 共有する。ラベルは popover が選択集合を丸ごと通知するため、配列をそのまま更新に渡す。
 *
 * @param task - 対象タスク
 * @param onTaskUpdate - タスク更新コールバック
 * @returns 細粒度ハンドラ群（{@link DetailFieldHandlers}）
 */
export const useDetailFieldHandlers = (
  task: Task,
  onTaskUpdate: TaskUpdateHandler,
): DetailFieldHandlers => {
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

  const onLabelsChange = useCallback(
    (labels: string[]) => {
      onTaskUpdate(task.id, { labels });
    },
    [task.id, onTaskUpdate],
  );

  const onChangeDraft = useCallback(
    (draft: boolean) => {
      onTaskUpdate(task.id, { draft });
    },
    [task.id, onTaskUpdate],
  );

  return {
    onStatusChange,
    onPriorityChange,
    onLabelsChange,
    onChangeDraft,
  };
};
