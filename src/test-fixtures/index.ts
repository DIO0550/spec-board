import {
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type {
  TaskProjection,
  TaskProjectionMap,
} from "@/domains/task-projection";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";

/** Storybook 用の固定カラム配列。 */
export const initialColumns: Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

const initialTaskPayloads: TaskPayload[] = [
  {
    id: "task-1",
    title: "ログイン画面のバグ修正",
    status: "Todo",
    priority: "High",
    labels: ["bug", "frontend"],
    parent: undefined,
    links: ["tasks/search-feature.md"],
    children: ["tasks/login-ui-fix.md"],
    reverseLinks: [],
    body: "ログイン画面でエラーメッセージが表示されない問題を修正する。",
    filePath: "tasks/fix-login-bug.md",
    extras: {},
    warnings: [],
  },
  {
    id: "task-2",
    title: "検索機能の追加",
    status: "In Progress",
    priority: "Medium",
    labels: ["feature", "frontend"],
    parent: undefined,
    links: [],
    children: [],
    reverseLinks: ["tasks/fix-login-bug.md"],
    body: "商品一覧ページにキーワード検索機能を追加する。\n\n## 受け入れ基準\n\n- キーワード入力で部分一致検索できる\n- 検索結果が0件の場合メッセージを表示する",
    filePath: "tasks/search-feature.md",
    extras: {},
    warnings: [],
  },
  {
    id: "task-3",
    title: "ログインUIの修正",
    status: "Todo",
    priority: "Low",
    labels: ["frontend"],
    parent: "tasks/fix-login-bug.md",
    links: [],
    children: [],
    reverseLinks: [],
    body: "ログインフォームのレイアウトを調整する。",
    filePath: "tasks/login-ui-fix.md",
    extras: {},
    warnings: [],
  },
  {
    id: "task-4",
    title: "READMEの更新",
    status: "Done",
    labels: ["docs"],
    parent: undefined,
    links: ["tasks/search-feature.md"],
    children: [],
    reverseLinks: [],
    body: "プロジェクトのREADMEを最新の仕様に合わせて更新する。",
    filePath: "tasks/update-readme.md",
    extras: {},
    warnings: [],
  },
  {
    id: "task-5",
    title: "API エンドポイントの設計",
    status: "In Progress",
    priority: "High",
    labels: ["backend", "design"],
    parent: undefined,
    links: [],
    children: [],
    reverseLinks: [],
    body: "RESTful API のエンドポイント設計を行う。",
    filePath: "tasks/api-design.md",
    extras: {},
    warnings: [],
  },
];

/** Storybook 用の固定タスク配列。 */
export const initialTasks = initialTaskPayloads.map(Task.fromPayload);

/**
 * タスク配列から、バックエンドが返すのと同じ形の projection map を組み立てる。
 *
 * 集計の実装はバックエンドにあり、Storybook にはバックエンドが無い。ストーリーを
 * 「BE から集計が届いた状態」で描画するために、fixture 側で同じ契約
 * （全子孫を数える / root は含まない / 循環と重複経路は 1 回だけ / 直接子は
 * filePath 昇順）を再現する。プロダクションコードからは参照しない。
 * @param tasks - 母集団のタスク配列
 * @param doneColumn - 完了として扱うカラム名
 * @returns filePath -> projection の Map
 */
export const buildProjectionsFixture = (
  tasks: readonly Task[],
  doneColumn: string,
): TaskProjectionMap => {
  const childrenOf = new Map<string, string[]>();
  for (const task of tasks) {
    const parent = task.hierarchy.parentFilePath;
    if (parent === undefined || parent === task.filePath) {
      continue;
    }
    const normalized = normalizeRefPathForLookup(parent);
    const resolved = tasks.find(
      (candidate) =>
        normalized !== undefined &&
        normalizeTaskPathForLookup(candidate.filePath) === normalized,
    );
    if (resolved === undefined) {
      continue;
    }
    const bucket = childrenOf.get(resolved.filePath) ?? [];
    bucket.push(task.filePath);
    childrenOf.set(resolved.filePath, bucket);
  }
  for (const bucket of childrenOf.values()) {
    bucket.sort();
  }

  const statusOf = new Map(tasks.map((task) => [task.filePath, task.status]));
  const map = new Map<string, TaskProjection>();
  for (const task of tasks) {
    const visited = new Set<string>([task.filePath]);
    const stack = [...(childrenOf.get(task.filePath) ?? [])];
    let done = 0;
    let total = 0;
    while (stack.length > 0) {
      const filePath = stack.pop();
      if (filePath === undefined || visited.has(filePath)) {
        continue;
      }
      visited.add(filePath);
      total += 1;
      if (statusOf.get(filePath) === doneColumn) {
        done += 1;
      }
      stack.push(...(childrenOf.get(filePath) ?? []));
    }
    map.set(task.filePath, {
      subIssueProgress: { done, total },
      isDone: task.status === doneColumn,
      childFilePaths: childrenOf.get(task.filePath) ?? [],
    });
  }
  return map;
};
