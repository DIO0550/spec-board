import { useCallback, useMemo } from "react";
import type { Task, TaskId } from "@/types/task";
import { buildFileTree } from "../../lib/buildFileTree";
import { FileNodeItem } from "./FileNodeItem";

/** FileTree の Props。 */
type FileTreeProps = {
  /** ツリー化するタスク一覧 */
  tasks: Task[];
  /** 現在選択中のタスク ID（ハイライト用） */
  selectedTaskId?: TaskId | null;
  /**
   * ファイル（タスク）選択時のコールバック。
   * @param taskId - 選択されたタスクの ID
   */
  onSelectTask: (taskId: TaskId) => void;
};

/**
 * タスクファイルのディレクトリツリー。ディレクトリは展開 / 折りたたみでき、
 * ファイル（タスク）クリックで選択する。
 * @param props - {@link FileTreeProps}
 * @returns ファイルツリー要素
 */
export const FileTree = ({
  tasks,
  selectedTaskId,
  onSelectTask,
}: FileTreeProps) => {
  const roots = useMemo(() => buildFileTree(tasks), [tasks]);
  const handleSelect = useCallback(
    (taskId: TaskId) => onSelectTask(taskId),
    [onSelectTask],
  );

  if (roots.length === 0) {
    return <p className="spec-file-tree-empty">タスクがありません</p>;
  }

  return (
    <ul className="spec-file-tree">
      {roots.map((node) => (
        <FileNodeItem
          key={
            node.kind === "dir" ? `dir:${node.path}` : `file:${node.task.id}`
          }
          node={node}
          depth={0}
          selectedTaskId={selectedTaskId}
          onSelect={handleSelect}
        />
      ))}
    </ul>
  );
};
