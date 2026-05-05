import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import { parentReferencesTaskPath } from "@/domains/task-path";

/** サブ Issue の進捗集計 */
export type SubIssueProgress = {
  /** 子タスクの総件数 */
  total: number;
  /** 完了している件数 */
  doneCount: number;
  /** 進捗率（0-100、Math.round） */
  percentage: number;
};

/**
 * サブ Issue ドメインの companion。
 * 子タスクの抽出、進捗計算、完了カラムの解決を提供する純粋関数群。
 */
export const SubIssue = {
  /**
   * 親タスクのファイルパスから直接の子タスクのみを抽出する。
   * @param allTasks - 全タスク（undefined のときは空配列）
   * @param parentFilePath - 親タスクのファイルパス
   * @returns 子タスクの配列
   */
  filter: (
    allTasks: readonly Task[] | undefined,
    parentFilePath: string,
  ): readonly Task[] => {
    if (allTasks === undefined) {
      return [];
    }
    return allTasks.filter((t) =>
      parentReferencesTaskPath(t.parent, parentFilePath),
    );
  },

  /**
   * 子タスク群の進捗を集計する。
   * @param childTasks - 子タスクの配列
   * @param doneColumn - 完了として扱うカラム名
   * @returns 進捗集計結果
   */
  progress: (
    childTasks: readonly Task[],
    doneColumn: string,
  ): SubIssueProgress => {
    const total = childTasks.length;
    if (total === 0) {
      return { total: 0, doneCount: 0, percentage: 0 };
    }
    const doneCount = childTasks.filter((t) => t.status === doneColumn).length;
    const percentage = Math.round((doneCount / total) * 100);
    return { total, doneCount, percentage };
  },

  /**
   * 完了カラム名を解決する。明示的な指定があればそれを優先し、
   * なければカラム順序が最大のカラムを選ぶ（フォールバック: "Done"）。
   * @param columns - カラム一覧
   * @param override - 明示的な完了カラム名（任意）
   * @returns 完了カラム名
   */
  resolveDoneColumn: (
    columns: readonly Column[],
    override: string | undefined,
  ): string => {
    if (override !== undefined) {
      return override;
    }
    const maxOrderColumn = columns.reduce<Column | undefined>(
      (currentMax, column) =>
        currentMax === undefined || column.order > currentMax.order
          ? column
          : currentMax,
      undefined,
    );
    return maxOrderColumn?.name ?? "Done";
  },
} as const;
