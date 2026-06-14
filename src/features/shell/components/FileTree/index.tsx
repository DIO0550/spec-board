import { memo, useCallback, useMemo, useState } from "react";
import type { Task } from "@/types/task";
import { buildFileTree, type FileTreeNode } from "../../lib/buildFileTree";

/**
 * 1 段あたりのインデント幅（px）。
 * ファイルツリーは深い階層になりやすく横幅が限られるため、TreeView（16px）より
 * 狭い 12px に抑えて深いネストでも横スクロールしにくくする。
 */
const INDENT_PER_DEPTH = 12;

type FileNodeItemProps = {
  /** 描画するノード */
  node: FileTreeNode;
  /** ルートからの深さ */
  depth: number;
  /** 現在選択中のタスク ID（ハイライト用） */
  selectedTaskId?: string | null;
  /**
   * ファイル（タスク）選択ハンドラ（安定参照で渡す）。
   * @param taskId - 選択されたタスクの ID
   */
  onSelect: (taskId: string) => void;
};

/**
 * ファイルツリー 1 ノード（ディレクトリ or ファイル）。ディレクトリの折りたたみ状態を
 * ノード単位のローカル state で持つため、ある階層の開閉が他ノードの再描画を引き起こさない。
 * `memo` で props 不変時の再描画も避ける。
 * @param props - {@link FileNodeItemProps}
 * @returns ファイルノード要素
 */
const FileNodeItem = memo(
  ({ node, depth, selectedTaskId, onSelect }: FileNodeItemProps) => {
    // ファイルノードでは未使用だが、Hooks のルール上ノード種別に依らず常に同数呼ぶ。
    const [collapsed, setCollapsed] = useState(false);
    const indent = { paddingLeft: depth * INDENT_PER_DEPTH };

    if (node.kind === "file") {
      const isSelected = node.task.id === selectedTaskId;
      return (
        <li>
          <button
            type="button"
            onClick={() => onSelect(node.task.id)}
            style={indent}
            className={
              isSelected
                ? "flex w-full items-center bg-accent-soft px-2 py-0.5 text-left text-xs font-medium text-foreground"
                : "flex w-full items-center px-2 py-0.5 text-left text-xs text-foreground hover:bg-surface-muted"
            }
          >
            <span className="truncate" title={node.task.title}>
              {node.name}
            </span>
          </button>
        </li>
      );
    }

    return (
      <li>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          style={indent}
          className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs text-muted hover:bg-surface-muted"
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {!collapsed && (
          <ul>
            {node.children.map((child) => (
              <FileNodeItem
                key={
                  child.kind === "dir"
                    ? `dir:${child.path}`
                    : `file:${child.task.id}`
                }
                node={child}
                depth={depth + 1}
                selectedTaskId={selectedTaskId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  },
);

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
    (taskId: string) => onSelectTask(taskId),
    [onSelectTask],
  );

  if (roots.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted">タスクがありません</p>;
  }

  return (
    <ul className="flex flex-col">
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
