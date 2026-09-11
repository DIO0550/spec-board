import { buildProjectionsFixture } from "@/test-fixtures";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";

/**
 * Story用Taskを生成する。
 * @param overrides - 既定値を上書きするフィールド
 * @returns Story 用の Task
 */
export const makeDetailTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "issue-7",
    title: "カードのカラム間ドラッグ&ドロップ",
    status: "In Progress",
    priority: "High",
    milestone: "v0.3",
    due: "2026-08-20",
    labels: ["feature", "frontend", "a11y"],
    links: ["tasks/watcher-debounce.md"],
    children: ["tasks/keyboard-dnd.md"],
    reverseLinks: [],
    body: "## 概要\n\nカードを別のカラムへ移動できるようにする。\n\n## 受け入れ基準\n\n- [x] マウス操作\n- [ ] キーボード操作\n\n```ts\nconst order = 1024;\n```\n\n> ファイル監視との競合に注意する。",
    filePath: "tasks/card-drag-drop.md",
    extras: { author: "taro", assignees: ["taro", "hanako"] },
    warnings: [],
    ...overrides,
  });

export const detailTask = makeDetailTask();
export const parentTask = makeDetailTask({
  id: "parent",
  title: "DnD と操作性向上",
  filePath: "tasks/dnd-improvements.md",
  links: [],
  children: [detailTask.filePath],
});
export const childTask = makeDetailTask({
  id: "child",
  title: "キーボード DnD",
  status: "Done",
  parent: detailTask.filePath,
  filePath: "tasks/keyboard-dnd.md",
  links: [],
  children: [],
});

/** stories の allTasks 既定値（親 / 表示対象 / 子） */
export const detailAllTasks: Task[] = [parentTask, detailTask, childTask];
/** detailAllTasks から BE 相当で集計した projection（Done を完了カラムとする） */
export const detailProjections = buildProjectionsFixture(
  detailAllTasks,
  "Done",
);

export const detailColumns: Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1, color: "#d97706" },
  { name: "Done", order: 2, color: "#16a34a" },
];

/** @returns 常に成功する link 追加のダミー実装 */
export const noopAddLink = async () => Result.ok(detailTask);
/** @returns 常に成功する link 削除のダミー実装 */
export const noopRemoveLink = async () => Result.ok(detailTask);
