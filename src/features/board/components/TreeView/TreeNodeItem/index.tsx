import { memo, useState } from "react";
import type { TaskTreeNode } from "@/domains/task-forest";
import type { Task } from "@/types/task";

const INDENT_PER_DEPTH = 16;
const DETAILED_RENDER_DEPTH_LIMIT = 64;

type TreeNodeProgress = {
  readonly done: number;
  readonly total: number;
};

type TreeNodeItemProps = {
  node: TaskTreeNode;
  depth: number;
  tasksByFilePath: ReadonlyMap<string, Task>;
  /**
   * ノードを選択したときのcallback。
   * @param taskId - 選択されたタスクの ID
   */
  onSelect: (taskId: string) => void;
  /** TreeView toolbarから制御する展開状態。省略時は従来どおりlocal state。 */
  expanded?: boolean;
  /** TreeViewが全ノードを一括制御するときの展開path集合。 */
  expandedPaths?: ReadonlySet<string>;
  /** controlled時の展開切替通知。 */
  onToggle?: (filePath: string) => void;
  /** statusごとの表示色。 */
  accentByStatus?: ReadonlyMap<string, string>;
  /** filePathごとの子孫進捗。 */
  progressByFilePath?: ReadonlyMap<string, TreeNodeProgress>;
  /** 完了status。 */
  doneColumn?: string;
};

type CompactTreeFrame = {
  readonly node: TaskTreeNode;
  readonly depth: number;
  readonly root: boolean;
};

/** 子を持つノードに使うフォルダアイコン。 */
const FOLDER_ICON = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="size-4 shrink-0 text-accent"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

/** 子を持たないノードに使うドキュメントアイコン。 */
const DOCUMENT_ICON = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="size-4 shrink-0 text-muted"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </svg>
);

/** 詳細表示上限以降の可視行を反復走査し、深いDOM入れ子を作らず描画する。 */
const CompactTreeBranch = ({
  node,
  depth,
  tasksByFilePath,
  onSelect,
  expanded,
  expandedPaths,
  onToggle,
  progressByFilePath,
  doneColumn = "Done",
}: TreeNodeItemProps) => {
  const [locallyCollapsedPaths, setLocallyCollapsedPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const rows = [];
  const pending: CompactTreeFrame[] = [{ node, depth, root: true }];

  const handleToggle = (filePath: string): void => {
    if (onToggle !== undefined) {
      onToggle(filePath);
      return;
    }
    setLocallyCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  while (pending.length > 0) {
    const frame = pending.pop();
    if (frame === undefined) {
      continue;
    }
    const task = tasksByFilePath.get(frame.node.filePath);
    if (task === undefined) {
      continue;
    }

    const hasChildren = frame.node.children.length > 0;
    const controlledExpanded = expandedPaths?.has(frame.node.filePath);
    let isExpanded =
      controlledExpanded ?? !locallyCollapsedPaths.has(frame.node.filePath);
    if (
      controlledExpanded === undefined &&
      frame.root &&
      expanded !== undefined
    ) {
      isExpanded = expanded;
    }
    const progress = progressByFilePath?.get(frame.node.filePath) ?? {
      done: 0,
      total: frame.node.children.length,
    };
    const done = task.status === doneColumn;

    rows.push(
      <li key={frame.node.filePath}>
        <div
          data-tree-row={task.id}
          className={`grid min-h-8 grid-cols-[minmax(280px,1.7fr)_120px_28px_200px_100px_1fr] items-center border-b border-l border-border text-xs ${
            done ? "text-muted line-through" : "text-foreground"
          }`}
          style={{ paddingLeft: frame.depth * INDENT_PER_DEPTH }}
        >
          <span className="flex min-w-0 items-center pr-2">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => handleToggle(frame.node.filePath)}
                aria-label={isExpanded ? "折りたたむ" : "展開する"}
                aria-expanded={isExpanded}
                className="size-[18px] shrink-0 text-muted"
              >
                {isExpanded ? "▾" : "▸"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(task.id)}
              className="min-w-0 truncate text-left"
            >
              {task.title || task.filePath} {task.id}
            </button>
          </span>
          <span className="truncate">{task.status}</span>
          <span>{task.priority ?? "—"}</span>
          <span className="truncate">{task.labels.join(", ") || "—"}</span>
          <span>
            {progress.total === 0 ? "—" : `${progress.done}/${progress.total}`}
          </span>
          <code className="truncate" title={task.filePath}>
            {task.filePath}
          </code>
        </div>
      </li>,
    );

    if (!hasChildren || !isExpanded) {
      continue;
    }
    for (let index = frame.node.children.length - 1; index >= 0; index -= 1) {
      const child = frame.node.children[index];
      if (child !== undefined) {
        pending.push({ node: child, depth: frame.depth + 1, root: false });
      }
    }
  }

  return rows;
};

/** table-like treeの1行と子ノード。 */
export const TreeNodeItem = memo(
  ({
    node,
    depth,
    tasksByFilePath,
    onSelect,
    expanded,
    expandedPaths,
    onToggle,
    accentByStatus,
    progressByFilePath,
    doneColumn = "Done",
  }: TreeNodeItemProps) => {
    const [locallyCollapsed, setLocallyCollapsed] = useState(false);
    const task = tasksByFilePath.get(node.filePath);
    if (task === undefined) {
      return null;
    }

    const hasChildren = node.children.length > 0;
    const isExpanded =
      expandedPaths?.has(node.filePath) ?? expanded ?? !locallyCollapsed;
    const progress = progressByFilePath?.get(node.filePath) ?? {
      done: 0,
      total: node.children.length,
    };
    const progressPercentage =
      progress.total === 0
        ? 0
        : Math.round((progress.done / progress.total) * 100);
    const accent = accentByStatus?.get(task.status) ?? "var(--color-accent)";
    const done = task.status === doneColumn;

    /** 展開状態を切り替える。制御されている場合は親へ委譲する。 */
    const handleToggle = (): void => {
      if (onToggle !== undefined) {
        onToggle(node.filePath);
        return;
      }
      setLocallyCollapsed((current) => !current);
    };

    if (depth >= DETAILED_RENDER_DEPTH_LIMIT) {
      return (
        <CompactTreeBranch
          node={node}
          depth={depth}
          tasksByFilePath={tasksByFilePath}
          onSelect={onSelect}
          expanded={expanded}
          expandedPaths={expandedPaths}
          onToggle={onToggle}
          accentByStatus={accentByStatus}
          progressByFilePath={progressByFilePath}
          doneColumn={doneColumn}
        />
      );
    }

    return (
      <li>
        <div
          data-tree-row={task.id}
          className={`grid min-h-8 grid-cols-[minmax(280px,1.7fr)_120px_28px_200px_100px_1fr] items-center border-b border-border text-xs hover:bg-surface-muted ${
            depth > 0 ? "border-l border-l-border" : ""
          } ${done ? "text-muted line-through" : "text-foreground"}`}
          style={{ paddingLeft: depth * INDENT_PER_DEPTH }}
        >
          <div className="flex min-w-0 items-center pr-2">
            {hasChildren ? (
              <button
                type="button"
                onClick={handleToggle}
                aria-label={isExpanded ? "折りたたむ" : "展開する"}
                aria-expanded={isExpanded}
                className="inline-flex size-[18px] shrink-0 items-center justify-center rounded text-[10px] text-muted hover:bg-surface-muted hover:text-foreground"
              >
                {isExpanded ? "▾" : "▸"}
              </button>
            ) : (
              <span aria-hidden="true" className="inline-block w-5 shrink-0" />
            )}
            {hasChildren ? FOLDER_ICON : DOCUMENT_ICON}
            <button
              type="button"
              onClick={() => onSelect(task.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:text-accent"
            >
              <span className="truncate font-medium">
                {task.title || task.filePath}
              </span>
              <code className="shrink-0 font-mono text-[10px] text-muted">
                {task.id}
              </code>
            </button>
          </div>
          <span className="flex min-w-0 items-center gap-1.5 truncate pr-2">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            {task.status}
          </span>
          <span
            className="font-mono text-[10px] text-muted"
            title={task.priority}
          >
            {task.priority ?? "—"}
          </span>
          <span className="flex min-w-0 gap-1 overflow-hidden pr-2">
            {task.labels.length > 0
              ? task.labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="truncate rounded bg-accent-soft px-1.5 py-0.5 text-[10px]"
                  >
                    {label}
                  </span>
                ))
              : "—"}
          </span>
          <span className="flex items-center gap-1.5 pr-2">
            <span
              className="h-1.5 min-w-8 flex-1 overflow-hidden rounded bg-surface-muted"
              style={{
                backgroundImage: `linear-gradient(to right, var(--color-accent) 0 ${progressPercentage}%, transparent ${progressPercentage}%)`,
              }}
            />
            <span className="font-mono text-[10px] text-muted">
              {progress.total === 0
                ? "—"
                : `${progress.done}/${progress.total}`}
            </span>
          </span>
          <code
            className="truncate pr-2 font-mono text-[10px] text-muted"
            title={task.filePath}
          >
            {task.filePath}
          </code>
        </div>
        {hasChildren && isExpanded ? (
          <ul
            className={depth >= 0 ? "border-l border-l-border/70" : undefined}
          >
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.filePath}
                node={child}
                depth={depth + 1}
                tasksByFilePath={tasksByFilePath}
                onSelect={onSelect}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                accentByStatus={accentByStatus}
                progressByFilePath={progressByFilePath}
                doneColumn={doneColumn}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  },
);
