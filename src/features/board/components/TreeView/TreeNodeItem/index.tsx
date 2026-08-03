import { memo, useState } from "react";
import { DueBadge } from "@/components/DueBadge";
import type { TaskTreeNode } from "@/domains/task-forest";
import type { Task } from "@/types/task";

/**
 * 1 段あたりのインデント幅（px）。
 * タスク階層ツリーは各行にバッジやタイトルなど情報量が多く、親子関係を一目で
 * 追えるよう FileTree（12px）より広い 16px を採る。
 */
const INDENT_PER_DEPTH = 16;

type TreeNodeItemProps = {
  /** 描画するノード（`filePath` と children のみを持つ） */
  node: TaskTreeNode;
  /** ルートからの深さ（ルート = 0）。ネスト構造から自明な値なので payload では運ばない。 */
  depth: number;
  /** raw filePath -> Task の lookup（TreeView が可視タスクから作った Map） */
  tasksByFilePath: ReadonlyMap<string, Task>;
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
 * @returns ツリーノード要素。lookup が外れた場合は `null`
 */
export const TreeNodeItem = memo(
  ({ node, depth, tasksByFilePath, onSelect }: TreeNodeItemProps) => {
    const [collapsed, setCollapsed] = useState(false);
    const task = tasksByFilePath.get(node.filePath);
    // 枝刈り済み forest のノードは必ず可視タスクなので通常は起こらない。
    // 万一 lookup が外れたときは、そのノード配下ごと描画しない（children も出ない）。
    if (task === undefined) {
      return null;
    }
    const hasChildren = node.children.length > 0;

    return (
      <li>
        <div
          className="flex items-center gap-1 hover:bg-surface-muted"
          style={{ paddingLeft: depth * INDENT_PER_DEPTH }}
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
            onClick={() => onSelect(task.id)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-4 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {task.title}
            </span>
            <span className="shrink-0 text-xs text-muted">{task.status}</span>
            <DueBadge due={task.due} />
          </button>
        </div>
        {hasChildren && !collapsed && (
          <ul>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.filePath}
                node={child}
                depth={depth + 1}
                tasksByFilePath={tasksByFilePath}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  },
);
