import { createContext, useContext } from "react";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Task } from "@/types/task";

/** name → マイルストーン定義の Map（バッジ表示用）。 */
export type MilestonesByName = Map<string, MilestoneDefinition>;

/**
 * TaskCard 配下のサブコンポーネントが共有する横断データ。
 * Root（`TaskCardRoot`）が default 値適用と subIssueCounts 計算を済ませて配布する。
 */
export type TaskCardContextValue = {
  /** 表示するタスク */
  task: Task;
  /** 完了カラム名（Root で default 適用済み） */
  doneColumn: string;
  /** name → マイルストーン定義の Map。未指定は undefined のまま流す */
  milestonesByName: MilestonesByName | undefined;
  /** 1 件でもリンク切れ参照を持つかどうか */
  hasBrokenLink: boolean;
  /** 1 件でもパースエラー警告を持つかどうか */
  hasParseError: boolean;
  /** SubIssue 進捗（Root の useMemo で 1 度だけ計算済み） */
  subIssueCounts: { done: number; total: number };
  /** 直下子タスクの配列（Root で [] フォールバック適用済み） */
  childTasks: readonly Task[];
  /** 全子孫タスクの配列（Root で childTasks フォールバック適用済み） */
  descendantTasks: readonly Task[];
};

export const TaskCardContext = createContext<TaskCardContextValue | null>(null);

/**
 * TaskCard の context を取得する。Root（{@link TaskCardContext.Provider}）の外で
 * サブ部品を使うと null になるため、その場合は誤用として throw する。
 * @returns context 値
 * @throws Provider の外で呼ばれた場合
 */
export const useTaskCardContext = (): TaskCardContextValue => {
  const ctx = useContext(TaskCardContext);
  if (ctx === null) {
    throw new Error(
      "TaskCard.* は <TaskCard.Root>（旧 API 経路では <TaskCard>）の子としてのみ使用できます",
    );
  }
  return ctx;
};
