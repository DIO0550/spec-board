import { expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { searchTasks } from "..";

/**
 * テスト用に最小限の Task を構築する。
 * @param patch - 上書きしたい一部フィールド
 * @returns Task
 */
const makeTask = (patch: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: patch.id ?? patch.filePath ?? "id",
    title: patch.title ?? "",
    status: patch.status ?? "Todo",
    labels: patch.labels ?? [],
    body: patch.body ?? "",
    filePath: patch.filePath ?? "tasks/x.md",
    links: [],
    children: [],
    reverseLinks: [],
  });

const KEYBOARD_TASK = makeTask({
  id: "SB-42",
  title: "Keyboard shortcuts",
  labels: ["accessibility", "frontend"],
  filePath: "tasks/input/keyboard.md",
});

test.each([
  "keyboard",
  "sb-42",
  "input/keyboard",
  "ACCESSIBILITY",
])("title/id/path/labels を大文字小文字を区別せず検索できる: %s", (query) => {
  const results = searchTasks([KEYBOARD_TASK], query);
  expect(results.map((match) => match.task)).toEqual([KEYBOARD_TASK]);
});

test("空白 query は全 task を返し一致しない query は空になる", () => {
  const all = searchTasks([KEYBOARD_TASK], "   ");
  expect(all.map((match) => match.task)).toEqual([KEYBOARD_TASK]);
  expect(all[0]?.field).toBeUndefined();
  expect(searchTasks([KEYBOARD_TASK], "milestone")).toEqual([]);
});

test("本文にも一致し、一致箇所周辺の抜粋が付く", () => {
  const body = `${"a".repeat(100)} キーワード ${"b".repeat(100)}`;
  const task = makeTask({ filePath: "tasks/body.md", title: "A", body });
  const results = searchTasks([task], "キーワード");
  expect(results).toHaveLength(1);
  expect(results[0]?.field).toBe("body");
  const excerpt = results[0]?.excerpt ?? "";
  expect(excerpt).toContain("キーワード");
  expect(excerpt.length).toBeLessThan(body.length);
  expect(excerpt.startsWith("…")).toBe(true);
  expect(excerpt.endsWith("…")).toBe(true);
});

test("複数トークンは AND で解釈し、フィールドをまたいで一致してよい", () => {
  const tasks = [
    makeTask({ filePath: "tasks/a.md", title: "Login 改善", labels: ["bug"] }),
    makeTask({ filePath: "tasks/b.md", title: "Login 改善" }),
  ];
  const results = searchTasks(tasks, "login bug");
  expect(results.map((match) => match.task.filePath)).toEqual(["tasks/a.md"]);
});

test("タイトル一致が ID・ラベル・パス・本文一致より先に並ぶ", () => {
  const tasks = [
    makeTask({ filePath: "tasks/body.md", title: "X", body: "search" }),
    makeTask({ id: "path-task", filePath: "tasks/path-search.md", title: "Y" }),
    makeTask({ filePath: "tasks/label.md", title: "Z", labels: ["search"] }),
    makeTask({ filePath: "tasks/title.md", title: "search UI" }),
  ];
  const results = searchTasks(tasks, "search");
  expect(results.map((match) => match.task.filePath)).toEqual([
    "tasks/title.md",
    "tasks/label.md",
    "tasks/path-search.md",
    "tasks/body.md",
  ]);
  expect(results.map((match) => match.field)).toEqual([
    "title",
    "label",
    "filePath",
    "body",
  ]);
});

test("同順位は入力順（board 表示順）を保つ", () => {
  const tasks = [
    makeTask({ filePath: "tasks/1.md", title: "search one" }),
    makeTask({ filePath: "tasks/2.md", title: "search two" }),
  ];
  const results = searchTasks(tasks, "search");
  expect(results.map((match) => match.task.filePath)).toEqual([
    "tasks/1.md",
    "tasks/2.md",
  ]);
});

test("全角スペース区切りのトークンも AND で解釈する", () => {
  const tasks = [
    makeTask({ filePath: "tasks/a.md", title: "Login 改善", labels: ["bug"] }),
    makeTask({ filePath: "tasks/b.md", title: "Login 改善" }),
  ];
  const results = searchTasks(tasks, "login　bug");
  expect(results.map((match) => match.task.filePath)).toEqual(["tasks/a.md"]);
});
