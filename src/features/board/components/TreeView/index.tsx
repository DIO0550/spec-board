import { useCallback, useMemo, useState } from "react";
import { ColumnColor } from "@/domains/column-color";
import { TaskForest, type TaskTreeNode } from "@/domains/task-forest";
import type { Column } from "@/types/column";
import type { Task, TaskFilePath, TaskId } from "@/types/task";
import { TreeNodeItem } from "./TreeNodeItem";

type TreeViewProps = {
  tasks: Task[];
  taskTree: TaskForest;
  onTaskClick?: (taskId: TaskId) => void;
  /** status sectionの順序・色。 */
  columns?: readonly Column[];
  /** toolbarに表示するproject名。 */
  projectName?: string;
  /** 完了status。 */
  doneColumn?: string;
  /** status sectionからタスク作成を開始する。 */
  onAddTask?: (columnName: string) => void;
  /** 初回描画時に子を展開するか。既定はtrue。 */
  defaultExpanded?: boolean;
};

type Progress = { readonly done: number; readonly total: number };

/**
 * @param roots - 走査するツリーの根
 * @returns 子を持つノードの filePath 集合
 */
const collectExpandablePaths = (roots: TaskForest): Set<TaskFilePath> => {
  const result = new Set<TaskFilePath>();
  const stack = [...roots];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    if (current.children.length > 0) {
      result.add(current.filePath);
      stack.push(...current.children);
    }
  }
  return result;
};

/**
 * @param roots - 集計対象のツリー
 * @param tasksByFilePath - filePath をキーにしたタスク索引
 * @param doneColumn - 完了とみなす status
 * @returns filePath ごとの完了数と総数
 */
const buildProgress = (
  roots: TaskForest,
  tasksByFilePath: ReadonlyMap<TaskFilePath, Task>,
  doneColumn: string,
): ReadonlyMap<TaskFilePath, Progress> => {
  const result = new Map<TaskFilePath, Progress>();
  const pending: Array<{
    readonly node: TaskTreeNode;
    readonly visited: boolean;
  }> = roots.map((node) => ({ node, visited: false }));
  while (pending.length > 0) {
    const frame = pending.pop();
    if (frame === undefined) {
      continue;
    }
    if (!frame.visited) {
      pending.push({ node: frame.node, visited: true });
      for (const child of frame.node.children) {
        pending.push({ node: child, visited: false });
      }
      continue;
    }

    let done = 0;
    let total = 0;
    for (const child of frame.node.children) {
      const childProgress = result.get(child.filePath);
      total += 1 + (childProgress?.total ?? 0);
      done += childProgress?.done ?? 0;
      if (tasksByFilePath.get(child.filePath)?.status === doneColumn) {
        done += 1;
      }
    }
    result.set(frame.node.filePath, { done, total });
  }
  return result;
};

/** status sectionを持つtable-like tree view。 */
export const TreeView = ({
  tasks,
  taskTree,
  onTaskClick,
  columns,
  projectName = "タスクツリー",
  doneColumn = "Done",
  onAddTask,
  defaultExpanded = true,
}: TreeViewProps) => {
  const visibleFilePaths = useMemo(
    () => tasks.map((task) => task.filePath),
    [tasks],
  );
  const roots = useMemo(
    () => TaskForest.prune(taskTree, visibleFilePaths),
    [taskTree, visibleFilePaths],
  );
  const tasksByFilePath = useMemo(
    () => new Map(tasks.map((task) => [task.filePath, task])),
    [tasks],
  );
  const expandablePaths = useMemo(() => collectExpandablePaths(roots), [roots]);
  const [expandedPaths, setExpandedPaths] = useState<Set<TaskFilePath>>(() =>
    defaultExpanded ? new Set(expandablePaths) : new Set(),
  );
  const progressByFilePath = useMemo(
    () => buildProgress(roots, tasksByFilePath, doneColumn),
    [roots, tasksByFilePath, doneColumn],
  );

  const orderedColumns = useMemo<readonly Column[]>(() => {
    if (columns !== undefined) {
      return [...columns].sort((left, right) => left.order - right.order);
    }
    const statuses = roots
      .map((root) => tasksByFilePath.get(root.filePath)?.status)
      .filter((status): status is string => status !== undefined);
    return Array.from(new Set(statuses)).map((name, order) => ({
      name,
      order,
    }));
  }, [columns, roots, tasksByFilePath]);
  const accentByStatus = useMemo(
    () =>
      new Map(
        orderedColumns.map((column, index) => [
          column.name,
          ColumnColor.resolveAccent(column.color, index),
        ]),
      ),
    [orderedColumns],
  );

  const handleSelect = useCallback(
    (taskId: TaskId) => onTaskClick?.(taskId),
    [onTaskClick],
  );
  const handleToggle = useCallback((filePath: TaskFilePath) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  if (roots.length === 0) {
    return <p className="p-4 text-sm text-muted">表示するタスクがありません</p>;
  }

  return (
    <div className="min-w-0 bg-surface-muted p-4">
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <header
          data-tree-toolbar
          className="flex h-10 min-w-[850px] items-center gap-2 border-b border-border bg-surface px-3 text-xs"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 text-muted"
            fill="none"
            stroke="currentColor"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9H3z" />
          </svg>
          <strong className="text-foreground">{projectName}</strong>
          <span className="font-mono text-[10px] text-muted">
            {tasks.length} files
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              data-tree-action="expand-all"
              onClick={() => setExpandedPaths(new Set(expandablePaths))}
              className="rounded px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
            >
              すべて展開
            </button>
            <button
              type="button"
              data-tree-action="collapse-all"
              onClick={() => setExpandedPaths(new Set())}
              className="rounded px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
            >
              すべて折畳
            </button>
          </div>
        </header>
        <div className="overflow-x-auto">
          <div className="min-w-[850px]">
            <div
              data-tree-columns
              className="grid h-8 grid-cols-[minmax(280px,1.7fr)_120px_28px_200px_100px_1fr] items-center border-b border-border bg-surface-muted px-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
            >
              <span>タスク</span>
              <span>ステータス</span>
              <span>優先</span>
              <span>ラベル</span>
              <span>進捗</span>
              <span>ファイル</span>
            </div>
            {orderedColumns.map((column, index) => {
              const sectionRoots = roots.filter(
                (root) =>
                  tasksByFilePath.get(root.filePath)?.status === column.name,
              );
              if (sectionRoots.length === 0) {
                return null;
              }
              const accent = ColumnColor.resolveAccent(column.color, index);
              return (
                <section key={column.name} data-tree-section>
                  <header className="flex h-8 items-center gap-2 border-b border-border bg-surface-muted px-3 text-xs font-semibold text-foreground">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                    {column.name}
                    <span className="font-mono text-[10px] text-muted">
                      {sectionRoots.length}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                    {onAddTask !== undefined && (
                      <button
                        type="button"
                        onClick={() => onAddTask(column.name)}
                        className="rounded px-2 py-1 text-[11px] font-medium text-muted hover:bg-background hover:text-foreground"
                      >
                        + 追加
                      </button>
                    )}
                  </header>
                  <ul>
                    {sectionRoots.map((node) => (
                      <TreeNodeItem
                        key={node.filePath}
                        node={node}
                        depth={0}
                        tasksByFilePath={tasksByFilePath}
                        onSelect={handleSelect}
                        expandedPaths={expandedPaths}
                        onToggle={handleToggle}
                        accentByStatus={accentByStatus}
                        progressByFilePath={progressByFilePath}
                        doneColumn={doneColumn}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
