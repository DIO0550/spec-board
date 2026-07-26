import { createContext, useContext } from "react";
import type { SubIssueCounts } from "@/domains/task-projection";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Task } from "@/types/task";
import type { SubIssueRow } from "../../SubIssueProgress";

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
  /** SubIssue 進捗（BE projection 由来。全子孫ベースで集計済み） */
  subIssueCounts: SubIssueCounts;
  /**
   * `<details>` 内に並べる直下子の表示行（Root が projection で解決済み）。
   *
   * 直下子の「実体（Task 配列）」も projection map を capture した関数
   * （`card.isDone`）も context には載せない。前者は Column が毎 render 新配列を
   * 作るため、後者は 1 エントリの変化で全カードの memo を落とすため。
   * per-card に閉じた表示データだけを配ることで、「自カードの counts も子行も
   * 変わっていない」カードの context 参照が保たれる。
   */
  childRows: readonly SubIssueRow[];
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
