import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrokenLinkSet } from "@/domains/broken-link";
import type { TaskPathLookup } from "@/domains/task-path-lookup";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { useChildTasks } from "@/features/detail/hooks/useChildTasks";
import { useDeleteFlow } from "@/features/detail/hooks/useDeleteFlow";
import { useDetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { useEscToClose } from "@/features/detail/hooks/useEscToClose";
import { useParentTask } from "@/features/detail/hooks/useParentTask";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task, TaskFilePath, TaskId } from "@/types/task";
import type { Result } from "@/utils/result";
import { DetailBody } from "../DetailBody";
import { PropertiesSidebar } from "../PropertiesSidebar";

/** 全画面2ペイン詳細ビューの Props */
export type DetailScreenProps = {
  task: Task;
  columns: Column[];
  allTasks?: Task[];
  projections: TaskProjectionMap;
  tasksByNormalizedPath?: TaskPathLookup;
  /** 一覧へ戻るcallback。 */
  onBack: () => void;
  isUpperModalOpen?: boolean;
  /**
   * タスクの部分更新を要求するcallback。
   * @param id - 更新するタスクの ID
   * @param updates - 変更するフィールド
   */
  onTaskUpdate: (id: TaskId, updates: Partial<Omit<Task, "id">>) => void;
  /**
   * タスク削除を要求するcallback。
   * @param id - 削除するタスクの ID
   * @param orphanStrategy - 子タスクの扱い方
   */
  onDelete: (
    id: TaskId,
    orphanStrategy?: OrphanStrategy,
  ) => void | Promise<void>;
  /**
   * アーカイブ確定時のコールバック。未指定ならアーカイブボタンを表示しない。
   * @param task - アーカイブ対象タスク
   */
  onArchive?: (task: Task) => void | Promise<void>;
  onAddSubIssue?: (parentFilePath: TaskFilePath) => void;
  onSelectTask?: (taskId: TaskId) => void;
  onAddLink?: (
    sourceFilePath: TaskFilePath,
    targetFilePath: TaskFilePath,
  ) => Promise<Result<Task, unknown>>;
  onRemoveLink?: (
    sourceFilePath: TaskFilePath,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/**
 * 48px app chrome直下で、44px subbarと本文/propertiesの2ペインを提供する詳細画面。
 * 既存の更新・リンク・削除フローは各hookへ委譲し、ここでは画面構成だけを担う。
 * @param props - {@link DetailScreenProps}
 * @returns 全画面詳細ビュー要素
 */
export const DetailScreen = (props: DetailScreenProps) => {
  const {
    task,
    columns,
    allTasks,
    projections,
    tasksByNormalizedPath,
    onBack,
    onTaskUpdate,
    onDelete,
    onArchive,
    onAddSubIssue,
    onSelectTask,
    onAddLink,
    onRemoveLink,
    isUpperModalOpen = false,
  } = props;

  const childInfo = useChildTasks({
    parentFilePath: task.filePath,
    allTasks,
    projections,
  });
  const { parentTask } = useParentTask({ task, allTasks });
  const fieldHandlers = useDetailFieldHandlers(task, onTaskUpdate);
  const brokenLinks = useMemo(
    () => BrokenLinkSet.from(task, tasksByNormalizedPath),
    [task, tasksByNormalizedPath],
  );

  const [orphanStrategy, setOrphanStrategy] = useState<OrphanStrategy>("clear");
  const handleDelete = useCallback(() => {
    if (task.hierarchy.childFilePaths.length > 0) {
      return onDelete(task.id, orphanStrategy);
    }
    return onDelete(task.id);
  }, [task.id, task.hierarchy.childFilePaths.length, orphanStrategy, onDelete]);
  const deleteFlow = useDeleteFlow({ onDelete: handleDelete });
  const requestDelete = useCallback(() => {
    setOrphanStrategy("clear");
    deleteFlow.requestDelete();
  }, [deleteFlow.requestDelete]);

  const escSuspended = deleteFlow.isOpen || isUpperModalOpen;
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => sectionRef.current?.focus(), []);
  useEscToClose({ disabled: escSuspended, onEscape: onBack });

  const taskList = allTasks ?? [];
  const currentIndex = taskList.findIndex(
    (candidate) => candidate.id === task.id,
  );
  const previousTask =
    currentIndex > 0 ? taskList[currentIndex - 1] : undefined;
  const nextTask = currentIndex >= 0 ? taskList[currentIndex + 1] : undefined;
  const issuePosition = currentIndex >= 0 ? currentIndex + 1 : 1;
  const issueTotal = taskList.length > 0 ? taskList.length : 1;
  const fileName = task.filePath.split("/").pop() ?? task.filePath;

  /**
   * 隣接Issueへ移動する。
   * @param target - 遷移先タスク
   */
  const selectAdjacentTask = (target: Task | undefined) => {
    if (target === undefined) {
      return;
    }
    onSelectTask?.(target.id);
  };

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="タスク詳細"
      data-detail-screen
      className="spec-detail-screen flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-bg focus:outline-none"
    >
      <h1 className="sr-only">{task.title || task.filePath}</h1>
      <nav
        data-testid="detail-subbar"
        aria-label="Issue ナビゲーション"
        className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-surface px-4 text-xs"
      >
        <button
          type="button"
          data-testid="detail-back-button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 font-medium text-muted hover:bg-surface-muted hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          onClick={onBack}
        >
          ← 一覧へ戻る
        </button>
        <span className="font-mono text-[11.5px] text-text-dim">·</span>
        <span className="max-w-72 truncate font-mono text-[11.5px] font-medium text-foreground">
          {fileName}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="mr-1 font-mono text-[11.5px] text-muted">
            {issuePosition} / {issueTotal}
          </span>
          <button
            type="button"
            aria-label="前のIssue"
            disabled={previousTask === undefined || onSelectTask === undefined}
            onClick={() => selectAdjacentTask(previousTask)}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface-muted text-muted hover:border-border-strong hover:text-foreground disabled:opacity-40"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="次のIssue"
            disabled={nextTask === undefined || onSelectTask === undefined}
            onClick={() => selectAdjacentTask(nextTask)}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface-muted text-muted hover:border-border-strong hover:text-foreground disabled:opacity-40"
          >
            ›
          </button>
          <button
            type="button"
            onClick={onBack}
            className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2.5 text-xs font-medium hover:border-border-strong hover:bg-bg"
          >
            × Close Issue
          </button>
        </div>
      </nav>

      <div
        data-testid="detail-layout"
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_320px]"
      >
        <main className="min-h-0 overflow-y-auto px-8 py-[22px]">
          <div
            data-testid="detail-content-inner"
            className="mx-auto max-w-[820px]"
          >
            <DetailBody
              task={task}
              subIssueCounts={childInfo.subIssueCounts}
              onTitleConfirm={(title) => onTaskUpdate(task.id, { title })}
              onBodyConfirm={(body) => onTaskUpdate(task.id, { body })}
            />
          </div>
        </main>
        <div className="min-h-0 overflow-y-auto border-t border-border bg-surface md:border-l md:border-t-0">
          <PropertiesSidebar
            task={task}
            columns={columns}
            allTasks={allTasks}
            childInfo={childInfo}
            parentTask={parentTask}
            brokenLinks={brokenLinks}
            handlers={fieldHandlers}
            onAddSubIssue={onAddSubIssue}
            onSelectTask={onSelectTask}
            onAddLink={onAddLink}
            onRemoveLink={onRemoveLink}
            deleteFlow={{ ...deleteFlow, requestDelete }}
            onArchive={onArchive ? () => onArchive(task) : undefined}
            orphanStrategy={orphanStrategy}
            onOrphanStrategyChange={setOrphanStrategy}
          />
        </div>
      </div>
    </section>
  );
};
