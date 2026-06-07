import { type ReactNode, useMemo, useState } from "react";
import type { Task } from "@/types/task";
import { buildFileTree, type FileTreeNode } from "../../lib/buildFileTree";

/** 1 段あたりのインデント幅（px）。 */
const INDENT_PER_DEPTH = 12;

/** FileTree の Props。 */
type FileTreeProps = {
  /** ツリー化するタスク一覧 */
  tasks: Task[];
  /** 現在選択中のタスク ID（ハイライト用） */
  selectedTaskId?: string | null;
  /**
   * ファイル（タスク）選択時のコールバック。
   * @param taskId - 選択されたタスクの ID
   */
  onSelectTask: (taskId: string) => void;
};

/**
 * タスクファイルのディレクトリツリー。ディレクトリは展開/折りたたみでき、
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
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleDir = (path: string): void => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (roots.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted">タスクがありません</p>;
  }

  const renderNode = (node: FileTreeNode, depth: number): ReactNode => {
    const indent = { paddingLeft: depth * INDENT_PER_DEPTH };
    if (node.kind === "dir") {
      const isCollapsed = collapsedDirs.has(node.path);
      return (
        <li key={`dir:${node.path}`}>
          <button
            type="button"
            onClick={() => toggleDir(node.path)}
            aria-expanded={!isCollapsed}
            style={indent}
            className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs text-muted hover:bg-surface-muted"
          >
            <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
            <span className="truncate">{node.name}</span>
          </button>
          {!isCollapsed && (
            <ul>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }
    const isSelected = node.task.id === selectedTaskId;
    return (
      <li key={`file:${node.task.id}`}>
        <button
          type="button"
          onClick={() => onSelectTask(node.task.id)}
          style={indent}
          className={
            isSelected
              ? "flex w-full items-center px-2 py-0.5 text-left text-xs text-accent"
              : "flex w-full items-center px-2 py-0.5 text-left text-xs text-foreground hover:bg-surface-muted"
          }
        >
          <span className="truncate">{node.task.title}</span>
        </button>
      </li>
    );
  };

  return (
    <ul className="flex flex-col">
      {roots.map((node) => renderNode(node, 0))}
    </ul>
  );
};
