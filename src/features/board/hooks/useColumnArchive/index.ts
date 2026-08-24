import { useCallback } from "react";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import type { ProjectTaskActionsContextValue } from "@/providers/ProjectProvider";
import type { Task, TaskFilePath } from "@/types/task";
import type { UseToastsResult } from "@/types/toast";

export type ColumnArchiveCallback = (columnName: string) => Promise<void>;

export type UseColumnArchiveOptions = {
  tasks: readonly Task[];
  archiveTask: ProjectTaskActionsContextValue["archiveTask"];
  showToast: UseToastsResult["showToast"];
};

/**
 * カラム内タスクを親子関係の深い順（子が先）に並べ替える。
 *
 * archive_task は子を持つタスクを拒否するため、親を先に送ると
 * 「子がまだカラム内に居る」だけで失敗する。同一カラム内で完結する親子は
 * 子から順にアーカイブすれば 1 パスで全件成功する。カラム外に子を持つ親の
 * 失敗は順序では救えないので、そのまま失敗として報告する。
 * @param tasks - 対象カラムのタスク一覧
 * @returns 子孫が先に来る順の新しい配列
 */
const orderChildrenFirst = (tasks: readonly Task[]): Task[] => {
  const parentByChildFilePath = TaskHierarchy.parentByChildFilePath(tasks);
  const depthOf = (task: Task): number => {
    let depth = 0;
    const visited = new Set<TaskFilePath>([task.filePath]);
    let parentPath = parentByChildFilePath.get(task.filePath);
    while (parentPath !== undefined) {
      if (visited.has(parentPath)) {
        break;
      }
      visited.add(parentPath);
      depth += 1;
      parentPath = parentByChildFilePath.get(parentPath);
    }
    return depth;
  };
  // sort の comparator 内で毎回親チェーンを辿らないよう、深さは 1 回だけ計算する。
  const depthByFilePath = new Map(
    tasks.map((task) => [task.filePath, depthOf(task)]),
  );
  return [...tasks].sort(
    (left, right) =>
      (depthByFilePath.get(right.filePath) ?? 0) -
      (depthByFilePath.get(left.filePath) ?? 0),
  );
};

/**
 * カラム内の全タスクを 1 件ずつ直列にアーカイブする callback を返すフック。
 *
 * 失敗（カラム外に子が残る親など）は該当タスクだけスキップして続行し、
 * 結果を成功 / 失敗件数の toast で要約する。個々の失敗詳細は
 * invokeWrapped の共通失敗トースト（archive_task は allowlist 内）が担う。
 * @param options - tasks / archiveTask action / 通知系
 * @returns カラム名を受け取る一括アーカイブ callback
 */
export const useColumnArchive = ({
  tasks,
  archiveTask,
  showToast,
}: UseColumnArchiveOptions): ColumnArchiveCallback =>
  useCallback(
    async (columnName) => {
      const targets = orderChildrenFirst(
        tasks.filter((task) => task.status === columnName),
      );
      if (targets.length === 0) {
        showToast("アーカイブ対象のタスクがありません", "warning");
        return;
      }
      let archivedCount = 0;
      let failedCount = 0;
      for (const target of targets) {
        const result = await archiveTask({ filePath: target.filePath });
        if (result.ok) {
          archivedCount += 1;
        } else {
          failedCount += 1;
        }
      }
      if (failedCount === 0) {
        showToast(`${archivedCount} 件のタスクをアーカイブしました`, "success");
        return;
      }
      showToast(
        `${archivedCount} 件をアーカイブしました（${failedCount} 件は失敗）`,
        "warning",
      );
    },
    [tasks, archiveTask, showToast],
  );
