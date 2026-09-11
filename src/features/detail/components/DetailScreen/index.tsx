import { useEffect, useRef } from "react";
import type { LabelDefinition } from "@/domains/label-definition";
import type { TaskPathLookup } from "@/domains/task-path-lookup";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { useEscToClose } from "@/features/detail/hooks/useEscToClose";
import type { Column } from "@/types/column";
import type { Task, TaskFilePath, TaskId } from "@/types/task";
import {
  DeleteFlowProvider,
  type DeleteTaskHandler,
  useDeleteFlowContext,
} from "../DeleteFlowProvider";
import { DetailBody } from "../DetailBody";
import {
  type AddLinkHandler,
  DetailProvider,
  type RemoveLinkHandler,
  useDetail,
} from "../DetailProvider";
import { PropertiesSidebar } from "../PropertiesSidebar";

/** 全画面2ペイン詳細ビューの Props */
export type DetailScreenProps = {
  task: Task;
  columns: Column[];
  allTasks?: Task[];
  projections: TaskProjectionMap;
  tasksByNormalizedPath?: TaskPathLookup;
  /**
   * ラベル入力のサジェスト候補（App の唯一の取得点 useLabels 由来）。
   * 未指定は候補なし（新規作成のみ可能）。
   */
  labelSuggestions?: LabelDefinition[];
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
  onDelete: DeleteTaskHandler;
  /**
   * アーカイブ確定時のコールバック。未指定ならアーカイブボタンを表示しない。
   * @param task - アーカイブ対象タスク
   */
  onArchive?: (task: Task) => void | Promise<void>;
  onAddSubIssue?: (parentFilePath: TaskFilePath) => void;
  onSelectTask?: (taskId: TaskId) => void;
  onAddLink?: AddLinkHandler;
  onRemoveLink?: RemoveLinkHandler;
};

/** DetailScreenContent の Props（context に載せない画面制御系だけ） */
type DetailScreenContentProps = {
  /** 一覧へ戻るcallback */
  onBack: () => void;
  /**
   * アーカイブ確定時のコールバック。未指定ならアーカイブボタンを表示しない。
   * @param task - アーカイブ対象タスク
   */
  onArchive?: (task: Task) => void | Promise<void>;
  /** 上位モーダルが開いているか（Esc 抑止用） */
  isUpperModalOpen: boolean;
};

/**
 * 詳細画面の本体。Provider の内側で context を読み、subbar / 本文 / プロパティの 2 ペインを描く。
 * `useEscToClose` の抑止判定に削除ダイアログの開閉が要るため、Provider を返す
 * {@link DetailScreen} とは別コンポーネントにして context を読めるようにしている。
 * @param props - {@link DetailScreenContentProps}
 * @returns 全画面詳細ビュー要素
 */
const DetailScreenContent = ({
  onBack,
  onArchive,
  isUpperModalOpen,
}: DetailScreenContentProps) => {
  const { task, allTasks, onSelectTask, childInfo, handlers } = useDetail();
  const { isOpen: isDeleteDialogOpen } = useDeleteFlowContext();

  const escSuspended = isDeleteDialogOpen || isUpperModalOpen;
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
              onTitleConfirm={handlers.onTitleChange}
              onBodyConfirm={handlers.onBodyChange}
            />
          </div>
        </main>
        <div className="min-h-0 overflow-y-auto border-t border-border bg-surface md:border-l md:border-t-0">
          <PropertiesSidebar
            onArchive={onArchive ? () => onArchive(task) : undefined}
          />
        </div>
      </div>
    </section>
  );
};

/**
 * 48px app chrome直下で、44px subbarと本文/propertiesの2ペインを提供する詳細画面。
 * props を {@link DetailProvider} / {@link DeleteFlowProvider} に振り分け、描画は
 * {@link DetailScreenContent} に委ねる。
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
    labelSuggestions,
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

  return (
    <DetailProvider
      task={task}
      columns={columns}
      allTasks={allTasks}
      projections={projections}
      tasksByNormalizedPath={tasksByNormalizedPath}
      labelSuggestions={labelSuggestions}
      onTaskUpdate={onTaskUpdate}
      onAddSubIssue={onAddSubIssue}
      onSelectTask={onSelectTask}
      onAddLink={onAddLink}
      onRemoveLink={onRemoveLink}
    >
      <DeleteFlowProvider task={task} onDelete={onDelete}>
        <DetailScreenContent
          onBack={onBack}
          onArchive={onArchive}
          isUpperModalOpen={isUpperModalOpen}
        />
      </DeleteFlowProvider>
    </DetailProvider>
  );
};
