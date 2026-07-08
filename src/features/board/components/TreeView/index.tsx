import { useCallback, useMemo } from "react";
import type { Task } from "@/types/task";
import { buildTaskTree } from "../../lib/buildTaskTree";
import { TreeNodeItem } from "./TreeNodeItem";

/** TreeView の Props。 */
type TreeViewProps = {
  /** 表示するタスク一覧（絞り込み済み） */
  tasks: Task[];
  /**
   * 行クリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick?: (taskId: string) => void;
};

/**
 * 親子階層をインデント付きツリーで表示するビュー。子を持つノードは展開 / 折りたたみできる。
 * @param props - {@link TreeViewProps}
 * @returns ツリービュー要素
 */
export const TreeView = ({ tasks, onTaskClick }: TreeViewProps) => {
  const roots = useMemo(() => buildTaskTree(tasks), [tasks]);
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
        <TreeNodeItem key={node.task.id} node={node} onSelect={handleSelect} />
      ))}
    </ul>
  );
};
