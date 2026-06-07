import { type ReactNode, useMemo, useState } from "react";
import { DueBadge } from "@/components/DueBadge";
import type { Task } from "@/types/task";
import { buildTaskTree, type TaskTreeNode } from "../../lib/buildTaskTree";

/** 1 段あたりのインデント幅（px）。 */
const INDENT_PER_DEPTH = 16;

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
 * 親子階層をインデント付きツリーで表示するビュー。子を持つノードは展開/折りたたみできる。
 * @param props - {@link TreeViewProps}
 * @returns ツリービュー要素
 */
export const TreeView = ({ tasks, onTaskClick }: TreeViewProps) => {
  const roots = useMemo(() => buildTaskTree(tasks), [tasks]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleCollapsed = (taskId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  if (roots.length === 0) {
    return <p className="p-4 text-sm text-muted">表示するタスクがありません</p>;
  }

  const renderNode = (node: TaskTreeNode): ReactNode => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.task.id);
    return (
      <li key={node.task.id}>
        <div
          className="flex items-center gap-1 hover:bg-surface-muted"
          style={{ paddingLeft: node.depth * INDENT_PER_DEPTH }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapsed(node.task.id)}
              aria-label={isCollapsed ? "展開する" : "折りたたむ"}
              aria-expanded={!isCollapsed}
              className="shrink-0 px-1 text-xs text-muted"
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span aria-hidden="true" className="inline-block w-5 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onTaskClick?.(node.task.id)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-4 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {node.task.title}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {node.task.status}
            </span>
            <DueBadge due={node.task.due} />
          </button>
        </div>
        {hasChildren && !isCollapsed && (
          <ul>{node.children.map((child) => renderNode(child))}</ul>
        )}
      </li>
    );
  };

  return <ul className="flex flex-col py-2">{roots.map(renderNode)}</ul>;
};
