import { useMemo } from "react";
import type { Task } from "@/types/task";

/** マイルストーン 1 件分の進捗。 */
export type MilestoneProgress = {
  /** 所属タスク件数 */
  total: number;
  /** done カラム所属タスク件数 */
  done: number;
  /**
   * 進捗率（done / total）。done カラム未解決 or 所属 0 件のときは undefined（進捗非表示）。
   */
  ratio?: number;
};

/**
 * マイルストーン名ごとの進捗を算出する純粋関数（フックの本体ロジック）。
 *
 * `milestoneNames` で渡したすべての名前についてエントリを作る（所属 0 件のマイルストーンも
 * `{ total: 0, ratio: undefined }` で含める）。done カラム未解決（`doneColumn === undefined`）
 * または所属 0 件のとき ratio は undefined（進捗バー非表示）。
 *
 * @param milestoneNames - 進捗を出すマイルストーン名一覧（registry 由来）
 * @param tasks - 全タスク
 * @param doneColumn - done とみなすカラム名（未解決は undefined）
 * @returns マイルストーン名 → 進捗 の Map
 */
export const computeMilestoneProgress = (
  milestoneNames: readonly string[],
  tasks: Task[],
  doneColumn: string | undefined,
): Map<string, MilestoneProgress> => {
  const progress = new Map<string, MilestoneProgress>();
  for (const name of milestoneNames) {
    const belonging = tasks.filter((task) => task.milestone === name);
    const total = belonging.length;
    const done = belonging.filter((task) => task.status === doneColumn).length;
    const hasRatio = doneColumn !== undefined && total > 0;
    progress.set(name, {
      total,
      done,
      ratio: hasRatio ? done / total : undefined,
    });
  }
  return progress;
};

/**
 * マイルストーン名ごとの進捗（done 件数 / 所属件数 / 進捗率）を算出するフック。
 * @param milestoneNames - 進捗を出すマイルストーン名一覧（registry 由来）
 * @param tasks - 全タスク
 * @param doneColumn - done とみなすカラム名（既存 ProjectData.doneColumn 由来・未解決は undefined）
 * @returns マイルストーン名 → 進捗 の Map
 */
export const useMilestoneProgress = (
  milestoneNames: readonly string[],
  tasks: Task[],
  doneColumn: string | undefined,
): Map<string, MilestoneProgress> =>
  useMemo(
    () => computeMilestoneProgress(milestoneNames, tasks, doneColumn),
    [milestoneNames, tasks, doneColumn],
  );
