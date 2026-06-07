import {
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type { Task } from "@/types/task";

/** タスク階層ツリーの 1 ノード。 */
export type TaskTreeNode = {
  /** このノードのタスク */
  task: Task;
  /** ルートからの深さ（ルート = 0） */
  depth: number;
  /** 子ノード（入力順を保持） */
  children: TaskTreeNode[];
};

/**
 * タスク配列を parent/children リンクから階層ツリーへ組み立てる。
 * 親が表示集合に存在しないタスク（孤立含む）はルートとして扱う。
 * 同じタスクを二度展開しない（万一の循環でも無限再帰しない）。
 * @param tasks - ツリー化するタスク一覧
 * @returns ルートノードの配列（入力順）
 */
export const buildTaskTree = (tasks: Task[]): TaskTreeNode[] => {
  const taskKeys = new Set<string>();
  for (const task of tasks) {
    taskKeys.add(normalizeTaskPathForLookup(task.filePath));
  }

  const childrenByParentKey = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const task of tasks) {
    const parentRef = task.hierarchy.parentFilePath;
    const parentKey =
      parentRef === undefined
        ? undefined
        : normalizeRefPathForLookup(parentRef);
    if (parentKey !== undefined && taskKeys.has(parentKey)) {
      const siblings = childrenByParentKey.get(parentKey) ?? [];
      siblings.push(task);
      childrenByParentKey.set(parentKey, siblings);
    } else {
      roots.push(task);
    }
  }

  const visited = new Set<string>();
  const buildNode = (task: Task, depth: number): TaskTreeNode => {
    const key = normalizeTaskPathForLookup(task.filePath);
    visited.add(key);
    const childTasks = childrenByParentKey.get(key) ?? [];
    const children = childTasks
      .filter(
        (child) => !visited.has(normalizeTaskPathForLookup(child.filePath)),
      )
      .map((child) => buildNode(child, depth + 1));
    return { task, depth, children };
  };

  const result = roots.map((task) => buildNode(task, 0));

  // 閉じた親循環（A.parent=B / B.parent=A など）は全員が「親あり」となり roots に
  // 入らず到達不能になる。visited にならなかったタスクをルートとして救済し可視化する。
  for (const task of tasks) {
    if (!visited.has(normalizeTaskPathForLookup(task.filePath))) {
      result.push(buildNode(task, 0));
    }
  }

  return result;
};
