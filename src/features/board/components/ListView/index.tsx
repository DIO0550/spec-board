import { useMemo, useState } from "react";
import { DueBadge } from "@/components/DueBadge";
import { ColumnColor } from "@/domains/column-color";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

type SortKey = "status" | "priority" | "title" | "file";
type SortDirection = "ascending" | "descending";

/** ListView の Props。 */
type ListViewProps = {
  /** 表示するタスク一覧（絞り込み済み） */
  tasks: Task[];
  /** status group の順序・色。省略時は tasks の登場順から導出する。 */
  columns?: readonly Column[];
  /** 完了として取り消し線を付ける status。 */
  doneColumn?: string;
  /** 選択中の task ID（active row 表示用）。 */
  selectedTaskId?: string | null;
  /** 絞り込み中か。0件時に空ボードとno-resultsを区別する。 */
  filterActive?: boolean;
  /** status group の追加ボタン。 */
  onAddTask?: (status: string) => void;
  /** 行クリック時のコールバック。 */
  onTaskClick?: (taskId: string) => void;
};

const TABLE_GRID =
  "grid-cols-[28px_96px_28px_minmax(220px,1fr)_220px_140px_140px_96px]";

const priorityRank = (task: Task): number => {
  if (task.priority === "High") {
    return 0;
  }
  if (task.priority === "Medium") {
    return 1;
  }
  if (task.priority === "Low") {
    return 2;
  }
  return 3;
};

const compareTasks = (left: Task, right: Task, key: SortKey): number => {
  if (key === "priority") {
    return priorityRank(left) - priorityRank(right);
  }
  if (key === "status") {
    return left.status.localeCompare(right.status, "ja");
  }
  if (key === "file") {
    return left.filePath.localeCompare(right.filePath, "ja");
  }
  return left.title.localeCompare(right.title, "ja");
};

const progressOf = (
  task: Task,
  tasksByFilePath: ReadonlyMap<string, Task>,
  doneColumn: string,
): { done: number; total: number } => {
  const children = task.hierarchy.childFilePaths
    .map((filePath) => tasksByFilePath.get(filePath))
    .filter((child): child is Task => child !== undefined);
  return {
    done: children.filter((child) => child.status === doneColumn).length,
    total: children.length,
  };
};

type SortButtonProps = {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
};

const SortButton = ({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: SortButtonProps) => {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      data-sort-key={sortKey}
      aria-label={`${label}: ${active ? direction : "並び替えなし"}`}
      onClick={() => onSort(sortKey)}
      className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-surface-muted ${
        active ? "font-semibold text-foreground" : "text-muted"
      }`}
    >
      {label}
      {active ? (
        <span aria-hidden="true">{direction === "ascending" ? "↑" : "↓"}</span>
      ) : null}
    </button>
  );
};

/** status group table 形式の一覧ビュー。 */
export const ListView = ({
  tasks,
  columns,
  doneColumn = "Done",
  selectedTaskId,
  filterActive = false,
  onAddTask,
  onTaskClick,
}: ListViewProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("ascending");

  const orderedColumns = useMemo<readonly Column[]>(() => {
    if (columns !== undefined) {
      return [...columns].sort((left, right) => left.order - right.order);
    }
    return Array.from(new Set(tasks.map((task) => task.status))).map(
      (name, order) => ({ name, order }),
    );
  }, [columns, tasks]);
  const tasksByFilePath = useMemo(
    () => new Map(tasks.map((task) => [task.filePath, task])),
    [tasks],
  );

  const handleSort = (nextKey: SortKey): void => {
    if (nextKey === sortKey) {
      setSortDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
      return;
    }
    setSortKey(nextKey);
    setSortDirection("ascending");
  };

  if (tasks.length === 0 && filterActive) {
    return (
      <p data-list-no-results className="p-4 text-sm text-muted">
        条件に一致するタスクがありません
      </p>
    );
  }

  if (tasks.length === 0 && orderedColumns.length === 0) {
    return <p className="p-4 text-sm text-muted">表示するタスクがありません</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 bg-surface-muted p-4">
      {orderedColumns.map((column, columnIndex) => {
        const accent = ColumnColor.resolveAccent(column.color, columnIndex);
        const groupTasks = tasks
          .filter((task) => task.status === column.name)
          .sort((left, right) => {
            const compared = compareTasks(left, right, sortKey);
            return sortDirection === "ascending" ? compared : -compared;
          });
        return (
          <section key={column.name} data-list-group className="min-w-0">
            <header className="sticky top-0 z-[1] flex items-center gap-2 bg-surface-muted py-2">
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold text-foreground"
                style={{ borderColor: accent }}
              >
                {column.name}
              </span>
              <span className="font-mono text-xs text-muted">
                {groupTasks.length}
              </span>
              <span className="h-px min-w-8 flex-1 bg-border" />
              {onAddTask !== undefined ? (
                <button
                  type="button"
                  onClick={() => onAddTask(column.name)}
                  className="rounded px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground"
                >
                  ＋ 追加
                </button>
              ) : null}
            </header>
            <div
              data-list-scroll
              className="overflow-x-auto rounded-lg border border-border bg-surface"
            >
              <div className="min-w-[1050px]">
                <div
                  data-list-header
                  className={`grid ${TABLE_GRID} h-8 items-center gap-2 border-b border-border bg-surface-muted px-2 text-[11px] font-medium text-muted`}
                >
                  <span aria-hidden="true" />
                  <SortButton
                    label="ステータス"
                    sortKey="status"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortButton
                    label="優先"
                    sortKey="priority"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortButton
                    label="タイトル"
                    sortKey="title"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <span>ラベル</span>
                  <span>期限</span>
                  <span>進捗</span>
                  <SortButton
                    label="ファイル"
                    sortKey="file"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </div>
                {groupTasks.length === 0 ? (
                  <p className="py-5 text-center text-xs text-muted">
                    タスクなし
                  </p>
                ) : (
                  <ul>
                    {groupTasks.map((task) => {
                      const progress = progressOf(
                        task,
                        tasksByFilePath,
                        doneColumn,
                      );
                      const selected = task.id === selectedTaskId;
                      const done = task.status === doneColumn;
                      return (
                        <li key={task.id}>
                          <button
                            type="button"
                            data-list-row
                            onClick={() => onTaskClick?.(task.id)}
                            className={`grid w-full ${TABLE_GRID} min-h-9 items-center gap-2 border-b border-border px-2 text-left text-xs last:border-b-0 hover:bg-surface-muted ${
                              selected
                                ? "border-l-[3px] border-l-accent bg-accent-soft"
                                : "border-l-[3px] border-l-transparent"
                            } ${done ? "text-muted line-through" : "text-foreground"}`}
                          >
                            <span
                              aria-hidden="true"
                              className="size-3.5 rounded border border-border"
                            />
                            <span className="flex items-center gap-1 truncate">
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: accent }}
                              />
                              {task.status}
                            </span>
                            <span
                              title={task.priority}
                              className="font-mono text-[10px] text-muted"
                            >
                              {task.priority?.slice(0, 1) ?? "—"}
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                              <code className="shrink-0 text-[10px] text-muted">
                                {task.id}
                              </code>
                              <span
                                data-list-row-title
                                className="truncate font-medium"
                              >
                                {task.title || task.filePath}
                              </span>
                            </span>
                            <span className="flex min-w-0 gap-1 overflow-hidden">
                              {task.labels.length > 0 ? (
                                task.labels.slice(0, 3).map((label) => (
                                  <span
                                    key={label}
                                    className="truncate rounded bg-accent-soft px-1.5 py-0.5 text-[10px]"
                                  >
                                    {label}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </span>
                            <DueBadge due={task.due} />
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded bg-surface-muted">
                                <span
                                  className="block h-full bg-accent"
                                  style={{
                                    width:
                                      progress.total === 0
                                        ? "0%"
                                        : `${Math.round((progress.done / progress.total) * 100)}%`,
                                  }}
                                />
                              </span>
                              <span className="font-mono text-[10px] text-muted">
                                {progress.total === 0
                                  ? "—"
                                  : `${progress.done}/${progress.total}`}
                              </span>
                            </span>
                            <code
                              className="truncate text-[10px] text-muted"
                              title={task.filePath}
                            >
                              {task.filePath.replace(/^tasks\//, "")}
                            </code>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
