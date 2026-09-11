import { createContext, type ReactNode, useContext, useMemo } from "react";
import { BrokenLinkSet } from "@/domains/broken-link";
import type { LabelDefinition } from "@/domains/label-definition";
import type { TaskPathLookup } from "@/domains/task-path-lookup";
import type { TaskProjectionMap } from "@/domains/task-projection";
import {
  type UseChildTasksResult,
  useChildTasks,
} from "@/features/detail/hooks/useChildTasks";
import {
  type DetailFieldHandlers,
  type TaskUpdateHandler,
  useDetailFieldHandlers,
} from "@/features/detail/hooks/useDetailFieldHandlers";
import { useParentTask } from "@/features/detail/hooks/useParentTask";
import type { Column } from "@/types/column";
import type { Task, TaskFilePath, TaskId } from "@/types/task";
import type { Result } from "@/utils/result";

/**
 * リンク追加ハンドラ。
 * @param sourceFilePath - リンク元 filePath
 * @param targetFilePath - リンク先 filePath
 * @returns invoke 結果
 */
export type AddLinkHandler = (
  sourceFilePath: TaskFilePath,
  targetFilePath: TaskFilePath,
) => Promise<Result<Task, unknown>>;

/**
 * リンク削除ハンドラ。
 * @param sourceFilePath - リンク元 filePath
 * @param targetFilePath - リンク先 filePath
 * @returns invoke 結果
 */
export type RemoveLinkHandler = (
  sourceFilePath: TaskFilePath,
  targetFilePath: string,
) => Promise<Result<Task, unknown>>;

/** DetailProvider の Props */
export type DetailProviderProps = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 全タスク一覧。未指定なら SubIssue / Links セクションを描画しない */
  allTasks?: Task[];
  /**
   * filePath -> projection（BE 集計）。**必須**。
   * テスト / Storybook は `TaskProjection.emptyMap` を明示的に渡す。
   */
  projections: TaskProjectionMap;
  /** 正規化済み filePath → Task の lookup。未指定なら broken link 判定を行わない（全て非 broken） */
  tasksByNormalizedPath?: TaskPathLookup;
  /** ラベル入力のサジェスト候補。未指定は候補なし */
  labelSuggestions?: LabelDefinition[];
  /** タスクの部分更新を要求するcallback */
  onTaskUpdate: TaskUpdateHandler;
  /**
   * サブIssue 追加ハンドラ。未指定なら SubIssue セクションを描画しない
   * @param parentFilePath - 親タスクの filePath
   */
  onAddSubIssue?: (parentFilePath: TaskFilePath) => void;
  /**
   * 別タスクへ表示対象を切り替えるハンドラ
   * @param taskId - 切り替え先タスクの ID
   */
  onSelectTask?: (taskId: TaskId) => void;
  /** リンク追加ハンドラ。未指定なら Links セクションを描画しない */
  onAddLink?: AddLinkHandler;
  /** リンク削除ハンドラ。未指定時は Links セクション内で no-op にフォールバックする */
  onRemoveLink?: RemoveLinkHandler;
  /** 配下の children */
  children: ReactNode;
};

/** DetailProvider が公開する API */
export type DetailApi = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 全タスク一覧（未指定のまま配る。SubIssue / Links の表示条件に使う） */
  allTasks: Task[] | undefined;
  /** 子タスク解決結果（useChildTasks 由来） */
  childInfo: UseChildTasksResult;
  /** 親タスク（無ければ null） */
  parentTask: Task | null;
  /** リンク切れ判定結果 */
  brokenLinks: BrokenLinkSet;
  /** status / priority / labels / draft / title / body の編集ハンドラ */
  handlers: DetailFieldHandlers;
  /** ラベル入力のサジェスト候補（未指定時は固定参照の空配列） */
  labelSuggestions: LabelDefinition[];
  /** サブIssue 追加ハンドラ（未指定のまま配る） */
  onAddSubIssue: ((parentFilePath: TaskFilePath) => void) | undefined;
  /** 別タスクへ表示対象を切り替えるハンドラ（未指定のまま配る） */
  onSelectTask: ((taskId: TaskId) => void) | undefined;
  /** リンク追加ハンドラ（未指定のまま配る） */
  onAddLink: AddLinkHandler | undefined;
  /** リンク削除ハンドラ（未指定のまま配る） */
  onRemoveLink: RemoveLinkHandler | undefined;
};

/** labelSuggestions 未指定時の固定参照（useMemo の miss を防ぐ） */
const EMPTY_LABEL_SUGGESTIONS: LabelDefinition[] = [];

const DetailContext = createContext<DetailApi | null>(null);

/**
 * detail feature の表示対象データ・派生値・編集ハンドラを配布する Provider。
 * 派生（子タスク / 親タスク / broken link / 細粒度ハンドラ）はここで 1 回だけ計算し、
 * consumer は `useDetail()` で読む。
 * @param props - {@link DetailProviderProps}
 * @returns Provider 要素
 */
export const DetailProvider = ({
  task,
  columns,
  allTasks,
  projections,
  tasksByNormalizedPath,
  labelSuggestions = EMPTY_LABEL_SUGGESTIONS,
  onTaskUpdate,
  onAddSubIssue,
  onSelectTask,
  onAddLink,
  onRemoveLink,
  children,
}: DetailProviderProps) => {
  const childInfo = useChildTasks({
    parentFilePath: task.filePath,
    allTasks,
    projections,
  });
  const { parentTask } = useParentTask({ task, allTasks });
  const handlers = useDetailFieldHandlers(task, onTaskUpdate);
  const brokenLinks = useMemo(
    () => BrokenLinkSet.from(task, tasksByNormalizedPath),
    [task, tasksByNormalizedPath],
  );

  const api = useMemo<DetailApi>(
    () => ({
      task,
      columns,
      allTasks,
      childInfo,
      parentTask,
      brokenLinks,
      handlers,
      labelSuggestions,
      onAddSubIssue,
      onSelectTask,
      onAddLink,
      onRemoveLink,
    }),
    [
      task,
      columns,
      allTasks,
      childInfo,
      parentTask,
      brokenLinks,
      handlers,
      labelSuggestions,
      onAddSubIssue,
      onSelectTask,
      onAddLink,
      onRemoveLink,
    ],
  );

  return (
    <DetailContext.Provider value={api}>{children}</DetailContext.Provider>
  );
};

/**
 * DetailProvider の API を取得する。Provider の外で呼ぶと throw する。
 * @returns DetailApi
 * @throws Provider の外で呼ばれた場合
 */
export const useDetail = (): DetailApi => {
  const ctx = useContext(DetailContext);
  if (ctx === null) {
    throw new Error("useDetail は <DetailProvider> の配下でのみ使用できます");
  }
  return ctx;
};
