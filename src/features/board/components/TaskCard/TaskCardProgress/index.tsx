import { useMemo } from "react";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import type { Task } from "@/types/task";
import { SubIssueProgress } from "../../SubIssueProgress";
import { useTaskCardContext } from "../TaskCardContext";

export type TaskCardProgressProps = {
  /**
   * Provider の childTasks / subIssueCounts を上書きするためのデータソース。
   * 指定時は done/total も再集計するため Provider 値は使わない（論理矛盾防止）。
   */
  childTasks?: readonly Task[];
};

/**
 * TaskCard の進捗バー行。Provider の `subIssueCounts` を使うが、props.childTasks が
 * 指定された場合だけはデータソース差し替えとして done/total も再集計する。
 * @param props - {@link TaskCardProgressProps}
 * @returns 進捗バー行
 */
export const TaskCardProgress = ({
  childTasks,
}: TaskCardProgressProps = {}) => {
  const ctx = useTaskCardContext();

  // override 時のみ countSubIssueProgress を回す。override 無し時は Provider が
  // すでに計算した subIssueCounts をそのまま流し、二重計算を防ぐ。
  const overrideCounts = useMemo(() => {
    if (childTasks === undefined) {
      return null;
    }
    return TaskHierarchy.countSubIssueProgress(childTasks, ctx.doneColumn);
  }, [childTasks, ctx.doneColumn]);

  const effectiveChildTasks = childTasks ?? ctx.childTasks;
  const counts = overrideCounts ?? ctx.subIssueCounts;

  return (
    <SubIssueProgress
      childTasks={effectiveChildTasks}
      done={counts.done}
      total={counts.total}
      doneColumn={ctx.doneColumn}
    />
  );
};
