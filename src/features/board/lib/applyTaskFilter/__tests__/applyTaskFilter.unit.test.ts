import { expect, test } from "vitest";
import type { Priority } from "@/domains/priority";
import { Task, type TaskPayload } from "@/types/task";
import {
  applyTaskFilter,
  EMPTY_TASK_FILTER,
  isTaskFilterActive,
  matchesTaskFilter,
  pruneTaskFilter,
  type TaskFilterCriteria,
} from "..";

const buildTask = (overrides: Partial<TaskPayload>): Task => {
  return Task.fromPayload({
    id: overrides.id ?? "id",
    title: overrides.title ?? "タイトル",
    status: overrides.status ?? "Todo",
    priority: overrides.priority,
    milestone: overrides.milestone,
    due: overrides.due,
    labels: overrides.labels ?? [],
    parent: overrides.parent,
    links: overrides.links ?? [],
    children: overrides.children ?? [],
    reverseLinks: overrides.reverseLinks ?? [],
    body: overrides.body ?? "",
    filePath: overrides.filePath ?? "tasks/a.md",
  });
};

const criteria = (
  overrides: Partial<TaskFilterCriteria>,
): TaskFilterCriteria => ({
  ...EMPTY_TASK_FILTER,
  ...overrides,
});

test("空条件はすべてのタスクに一致する", () => {
  const task = buildTask({ title: "何か" });
  expect(matchesTaskFilter(task, EMPTY_TASK_FILTER)).toBe(true);
});

test("pruneTaskFilter は利用可能な選択肢から外れた status/label を間引く", () => {
  const input = criteria({
    statuses: ["Todo", "Done"],
    labels: ["bug", "old"],
  });
  const result = pruneTaskFilter(input, {
    statuses: ["Done"],
    labels: ["bug"],
    milestoneNames: [],
  });
  expect(result.statuses).toEqual(["Done"]);
  expect(result.labels).toEqual(["bug"]);
});

test("pruneTaskFilter は削除されたマイルストーン条件を all に戻す", () => {
  const input = criteria({ milestone: { kind: "milestone", name: "v0.3" } });
  const result = pruneTaskFilter(input, {
    statuses: [],
    labels: [],
    milestoneNames: ["v0.4"],
  });
  expect(result.milestone).toEqual({ kind: "all" });
});

test("pruneTaskFilter は keyword / priorities と存続する条件を保持する", () => {
  const input = criteria({
    keyword: "auth",
    priorities: ["High"],
    statuses: ["Done"],
    milestone: { kind: "milestone", name: "v0.4" },
  });
  const result = pruneTaskFilter(input, {
    statuses: ["Done"],
    labels: [],
    milestoneNames: ["v0.4"],
  });
  expect(result.keyword).toBe("auth");
  expect(result.priorities).toEqual(["High"]);
  expect(result.statuses).toEqual(["Done"]);
  expect(result.milestone).toEqual({ kind: "milestone", name: "v0.4" });
});

test("キーワードはタイトルへ部分一致する（大文字小文字無視）", () => {
  const task = buildTask({ title: "Fix Login Bug" });
  expect(matchesTaskFilter(task, criteria({ keyword: "login" }))).toBe(true);
});

test("キーワードは本文へも部分一致する", () => {
  const task = buildTask({ title: "無関係", body: "詳細な再現手順" });
  expect(matchesTaskFilter(task, criteria({ keyword: "再現" }))).toBe(true);
});

test("キーワードがタイトルにも本文にも無ければ不一致", () => {
  const task = buildTask({ title: "A", body: "B" });
  expect(matchesTaskFilter(task, criteria({ keyword: "zzz" }))).toBe(false);
});

test("ラベルは選択集合のいずれかを含めば一致", () => {
  const task = buildTask({ labels: ["bug", "ui"] });
  expect(matchesTaskFilter(task, criteria({ labels: ["ui"] }))).toBe(true);
});

test("ラベルが選択集合のどれも含まなければ不一致", () => {
  const task = buildTask({ labels: ["bug"] });
  expect(matchesTaskFilter(task, criteria({ labels: ["ui"] }))).toBe(false);
});

test.each([
  ["High が選択され task が High なら一致", "High", ["High"], true],
  ["High が選択され task が Low なら不一致", "Low", ["High"], false],
] as const)("%s", (_label, taskPriority, selected, expected) => {
  const task = buildTask({ priority: taskPriority as Priority });
  expect(matchesTaskFilter(task, criteria({ priorities: [...selected] }))).toBe(
    expected,
  );
});

test("優先度が選択されているが task に優先度が無ければ不一致", () => {
  const task = buildTask({ priority: undefined });
  expect(matchesTaskFilter(task, criteria({ priorities: ["High"] }))).toBe(
    false,
  );
});

test("ステータスは選択集合に含まれれば一致", () => {
  const task = buildTask({ status: "Done" });
  expect(matchesTaskFilter(task, criteria({ statuses: ["Done"] }))).toBe(true);
});

test("複数条件は AND で結合される", () => {
  const match = buildTask({ title: "auth", labels: ["bug"], status: "Todo" });
  const partial = buildTask({ title: "auth", labels: ["ui"], status: "Todo" });
  const filter = criteria({ keyword: "auth", labels: ["bug"] });
  expect(matchesTaskFilter(match, filter)).toBe(true);
  expect(matchesTaskFilter(partial, filter)).toBe(false);
});

test("applyTaskFilter は一致タスクのみを順序保持で返す", () => {
  const tasks = [
    buildTask({ id: "1", title: "alpha" }),
    buildTask({ id: "2", title: "beta" }),
    buildTask({ id: "3", title: "alpha beta" }),
  ];
  const result = applyTaskFilter(tasks, criteria({ keyword: "alpha" }));
  expect(result.map((task) => task.id)).toEqual(["1", "3"]);
});

test.each([
  ["空条件は非アクティブ", EMPTY_TASK_FILTER, false],
  ["キーワード設定でアクティブ", criteria({ keyword: "x" }), true],
  ["空白のみのキーワードは非アクティブ", criteria({ keyword: "   " }), false],
  ["ラベル設定でアクティブ", criteria({ labels: ["a"] }), true],
  [
    "未割当マイルストーンでアクティブ",
    criteria({ milestone: { kind: "unassigned" } }),
    true,
  ],
] as const)("%s", (_label, input, expected) => {
  expect(isTaskFilterActive(input)).toBe(expected);
});
