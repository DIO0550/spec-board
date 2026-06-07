import { memo, useCallback, useMemo, useState } from "react";
import { DueBadge } from "@/components/DueBadge";
import type { Task } from "@/types/task";
import { buildTaskTree, type TaskTreeNode } from "../../lib/buildTaskTree";

/** 1 段あたりのインデント幅（px）。 */
const INDENT_PER_DEPTH = 16;

type TreeNodeItemProps = {
  /** 描画するノード（深さは node.depth を使う） */
  node: TaskTreeNode;
  /**
   * タスク選択ハンドラ（安定参照で渡す）。
   * @param taskId - 選択されたタスクの ID
   */
  onSelect: (taskId: string) => void;
};

/**
 * ツリー 1 ノード（行 + 子）。折りたたみ状態をノード単位のローカル state で持つため、
 * あるノードの開閉が他ノードの再描画を引き起こさない。`memo` で props 不変時の再描画も避ける。
 * @param props - {@link TreeNodeItemProps}
 * @returns ツリーノード要素
 */
const TreeNodeItem = memo(({ node, onSelect }: TreeNodeItemProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-1 hover:bg-surface-muted"
        style={{ paddingLeft: node.depth * INDENT_PER_DEPTH }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? "展開する" : "折りたたむ"}
            aria-expanded={!collapsed}
            className="shrink-0 px-1 text-xs text-muted"
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span aria-hidden="true" className="inline-block w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.task.id)}
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
      {hasChildren && !collapsed && (
        <ul>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.task.id}
              node={child}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
});

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
