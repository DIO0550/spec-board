import { useCallback, useMemo } from "react";
import { TaskForest } from "@/domains/task-forest";
import type { Task } from "@/types/task";
import { TreeNodeItem } from "./TreeNodeItem";

/** TreeView の Props。 */
type TreeViewProps = {
  /** 表示するタスク一覧（絞り込み済み・board 表示順） */
  tasks: Task[];
  /** BE 由来の全タスク正準ツリー。可視集合での枝刈りはこのコンポーネントで行う。 */
  taskTree: TaskForest;
  /**
   * 行クリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick?: (taskId: string) => void;
};

/**
 * 親子階層をインデント付きツリーで表示するビュー。子を持つノードは展開 / 折りたたみできる。
 * 階層そのものは BE（`taskTree`）が確定しており、ここは可視集合での枝刈りと
 * `filePath -> Task` の lookup だけを行う。
 * @param props - {@link TreeViewProps}
 * @returns ツリービュー要素
 */
export const TreeView = ({ tasks, taskTree, onTaskClick }: TreeViewProps) => {
  const visibleFilePaths = useMemo(
    () => tasks.map((task) => task.filePath),
    [tasks],
  );
  const roots = useMemo(
    () => TaskForest.prune(taskTree, visibleFilePaths),
    [taskTree, visibleFilePaths],
  );
  // キーは BE が返した raw filePath。`@/domains/broken-link` の正規化 path Map とは
  // 基準が異なるので流用しない（`TaskProjection.findByFilePath` と同じ注意）。
  // filePath はユーザー由来の任意文字列のため、プロトタイプ汚染を避けて Map を使う。
  const tasksByFilePath = useMemo(
    () => new Map(tasks.map((task) => [task.filePath, task])),
    [tasks],
  );
  const handleSelect = useCallback(
    (taskId: string) => onTaskClick?.(taskId),
    [onTaskClick],
  );

  if (roots.length === 0) {
    return <p className="p-4 text-sm text-muted">表示するタスクがありません</p>;
  }

  return (
    <ul className="flex flex-col py-2">
      {roots.map((node) => (
        <TreeNodeItem
          key={node.filePath}
          node={node}
          depth={0}
          tasksByFilePath={tasksByFilePath}
          onSelect={handleSelect}
        />
      ))}
    </ul>
  );
};
