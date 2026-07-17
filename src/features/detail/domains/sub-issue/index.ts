import type { Task } from "@/domains/task";
import { parentReferencesTaskPath } from "@/domains/task-path";

/**
 * サブ Issue ドメインの companion。
 * 親タスク配下の直接の子タスク抽出を提供する純粋関数群。
 *
 * 進捗集計（`TaskHierarchy.countSubIssueProgress`）・完了判定（`Task.isDone`）・
 * 完了カラム解決（`ProjectColumns.resolveDoneColumn`）はビュー横断の単一の真実源として
 * `src/domains/` に一元化されており、ここでは扱わない。
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
      parentReferencesTaskPath(t.hierarchy.parentFilePath, parentFilePath),
    );
  },
} as const;
