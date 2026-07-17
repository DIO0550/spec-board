import { Task } from "@/domains/task";
import { parentReferencesTaskPath } from "@/domains/task-path";

/** Task の親子階層情報 */
export type TaskHierarchy = {
  /** 親タスクのファイルパス（親がない場合は未設定） */
  parentFilePath?: string;
  /** 子タスクのファイルパスの配列（parent から逆引き） */
  childFilePaths: string[];
};

/** サブ Issue 進捗の集計結果。X/Y サマリと進捗バーが共有する単一の真実源。 */
export type SubIssueProgress = {
  /** 完了している件数 */
  done: number;
  /** 集計対象の総数 */
  total: number;
  /** 進捗率（0-100、Math.round。総数 0 のときは 0） */
  percentage: number;
};

/**
 * `children` から指定 path を除いた配列を返す。含まれていなければ元配列をそのまま返す。
 * @param children 元の child filePath 配列
 * @param filePath 除去対象の path
 * @returns 除去後の配列
 */
const removeChild = (children: string[], filePath: string): string[] => {
  if (!children.includes(filePath)) {
    return children;
  }

  return children.filter((child) => child !== filePath);
};

/**
 * `parent` 参照が `filePath` を指していれば剥がして undefined を返す。
 * @param parent 現在の parentFilePath
 * @param filePath 比較対象の path
 * @returns 参照が外れた後の parentFilePath
 */
const detachParent = (
  parent: string | undefined,
  filePath: string,
): string | undefined => {
  if (!parentReferencesTaskPath(parent, filePath)) {
    return parent;
  }

  return undefined;
};

/**
 * 階層情報から削除済み path への parent / child 参照を剥がした `TaskHierarchy` を返す。
 * @param hierarchy 元の階層情報
 * @param deletedFilePath 削除済み task の filePath
 * @returns 参照を剥がした後の階層情報
 */
const detachDeletedPath = (
  hierarchy: TaskHierarchy,
  deletedFilePath: string,
): TaskHierarchy => ({
  parentFilePath: detachParent(hierarchy.parentFilePath, deletedFilePath),
  childFilePaths: removeChild(hierarchy.childFilePaths, deletedFilePath),
});

/**
 * 2 つの `TaskHierarchy` で参照が変わっているか判定する。
 * @param current 変更前の階層情報
 * @param next 変更後の階層情報
 * @returns parent/children のいずれかが変わっていれば true
 */
const hasHierarchyChanges = (
  current: TaskHierarchy,
  next: TaskHierarchy,
): boolean =>
  next.parentFilePath !== current.parentFilePath ||
  next.childFilePaths !== current.childFilePaths;

/** `collectDescendants` のオプション */
export type CollectDescendantsOptions = {
  /** 事前構築済みの filePath → Task lookup Map。未指定なら内部で `allTasks` から構築する。 */
  lookup?: ReadonlyMap<string, Task>;
};

/**
 * 与えられた `allTasks` から `filePath` → `Task` の lookup Map を構築する。
 * @param allTasks 全タスク
 * @returns filePath をキーにした Map
 */
const buildLookup = (allTasks: readonly Task[]): ReadonlyMap<string, Task> =>
  new Map(allTasks.map((task) => [task.filePath, task]));

/**
 * `rootFilePath` を起点に DFS で子孫を収集する。
 * 重複訪問と root 自身の混入を `visited` Set で防ぐ。
 * @param rootFilePath 起点とする root の filePath
 * @param lookup filePath → Task の検索 Map
 * @returns 子孫タスク（root 自身は含まない、preorder）
 */
const dfsDescendants = (
  rootFilePath: string,
  lookup: ReadonlyMap<string, Task>,
): Task[] => {
  const result: Task[] = [];
  const visited = new Set<string>();
  // root 自身を先に visited に入れることで、サイクル時に root へ戻ってきても
  // 結果に混入させない（自己参照 A→A も同じ理由で打ち切られる）。
  visited.add(rootFilePath);

  const root = lookup.get(rootFilePath);
  if (root === undefined) {
    return result;
  }

  // pop ベースの stack で DFS する。子は逆順に push することで
  // preorder（最初に発見した順）の探索順を維持しつつ、配列先頭操作の
  // O(n) コスト（shift / unshift）を避ける。
  const stack: string[] = [];
  for (let i = root.hierarchy.childFilePaths.length - 1; i >= 0; i--) {
    stack.push(root.hierarchy.childFilePaths[i]);
  }
  while (stack.length > 0) {
    const filePath = stack.pop();
    if (filePath === undefined) {
      continue;
    }
    if (visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);
    const task = lookup.get(filePath);
    if (task === undefined) {
      continue;
    }
    result.push(task);
    const children = task.hierarchy.childFilePaths;
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  return result;
};

export const TaskHierarchy = {
  /**
   * Task の親子階層から削除済み task への参照を取り除く。
   *
   * @param task 階層関係を掃除する task
   * @param deletedFilePath 削除済み task の filePath
   * @returns 階層関係が変われば更新後 task、変わらなければ元 task
   */
  detachDeletedTask: (task: Task, deletedFilePath: string): Task => {
    const hierarchy = detachDeletedPath(task.hierarchy, deletedFilePath);

    if (!hasHierarchyChanges(task.hierarchy, hierarchy)) {
      return task;
    }

    return { ...task, hierarchy };
  },

  /**
   * `rootFilePath` を起点に全子孫タスクを再帰収集する。
   *
   * - root 自身は結果に含まない（子孫のみ）
   * - サイクル（A→B→A）や自己参照（A→A）でも有限ステップで停止する
   * - 同じ子孫に複数経路で到達しても 1 度だけ含める（visited Set による集合 semantics）
   * - `childFilePaths` が指す path が `allTasks` に存在しない場合はスキップする
   * - `options.lookup` を渡すと内部での Map 構築を省略できる（呼び出し側で `tasksByFilePath` 等を共有したいケース向け）
   * - 戻り値は DFS preorder（最初に発見した順）。順序に依存させないこと
   *
   * @param allTasks 探索対象の全タスク
   * @param rootFilePath 起点とする root の filePath
   * @param options lookup 共有のためのオプション
   * @returns root から到達可能な子孫タスク
   */
  collectDescendants: (
    allTasks: readonly Task[],
    rootFilePath: string,
    options?: CollectDescendantsOptions,
  ): readonly Task[] => {
    const lookup = options?.lookup ?? buildLookup(allTasks);
    return dfsDescendants(rootFilePath, lookup);
  },

  /**
   * 子孫タスクの完了数 / 総数 / 進捗率を集計する。
   * カードフッター・進捗バー・サブIssue セクションが同じ値を表示するための
   * サブIssue 進捗の単一の真実源。完了判定は `Task.isDone` に委譲する。
   *
   * @param descendantTasks 集計対象の子孫タスク（`collectDescendants` の結果を想定）
   * @param doneColumn 完了として扱うカラム名
   * @returns 完了数 `done` / 総数 `total` / 進捗率 `percentage`（総数 0 のときは 0）
   */
  countSubIssueProgress: (
    descendantTasks: readonly Task[],
    doneColumn: string,
  ): SubIssueProgress => {
    const total = descendantTasks.length;
    const done = descendantTasks.filter((task) =>
      Task.isDone(task, doneColumn),
    ).length;
    const percentage = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, percentage };
  },
} as const;
