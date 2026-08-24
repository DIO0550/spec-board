import type { Task, TaskId } from "@/types/task";

/**
 * `handleSelectTask` の本体ロジック。
 * target が tasks に無い場合は遷移を行わない（null を返す）。
 * - setSelectedTaskId をしてしまうと selectedTask が null になり、
 *   DetailScreen が unmount して MarkdownBody の未保存編集が破棄される。
 * - 例: watcher による外部削除や、render と click の間に対象が消えたレース。
 *
 * UI 側で title が空のときに filePath を fallback として表示する規約に合わせ、
 * announceText も同じ fallback を適用する。
 *
 * @param tasks 現在の tasks 配列
 * @param taskId 選択対象 id
 * @returns 遷移可能なときは `{ selectedTaskId, announceText }`、不可能なときは null
 */
export const selectTaskOutcome = (
  tasks: readonly Task[],
  taskId: TaskId,
): { selectedTaskId: TaskId; announceText: string } | null => {
  const target = tasks.find((t) => t.id === taskId);
  if (target === undefined) {
    return null;
  }
  return {
    selectedTaskId: taskId,
    announceText: `「${target.title || target.filePath}」を表示中`,
  };
};
