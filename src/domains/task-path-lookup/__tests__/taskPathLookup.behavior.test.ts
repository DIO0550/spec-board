import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskPathLookup } from "..";

test("fromTasks は正規化済み filePath をキーにした lookup を返す", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  const b = makeTask({ id: "b", filePath: "tasks/b.md" });
  const lookup = TaskPathLookup.fromTasks([a, b]);
  expect(lookup.get("tasks/a.md")).toBe(a);
  expect(lookup.get("tasks/b.md")).toBe(b);
});

test("fromTasks は空配列から空 lookup を返す", () => {
  expect(TaskPathLookup.fromTasks([]).size).toBe(0);
});

test.each([
  { label: "./ prefix", filePath: "./tasks/a.md" },
  { label: "backslash 区切り", filePath: "tasks\\a.md" },
])("fromTasks は $label の filePath も正規化して key にする", ({
  filePath,
}) => {
  const a = makeTask({ id: "a", filePath });
  expect(TaskPathLookup.fromTasks([a]).get("tasks/a.md")).toBe(a);
});

test("fromTasks は同一正規化 key のタスクを後勝ちで 1 件にまとめる", () => {
  const first = makeTask({ id: "first", filePath: "tasks/a.md" });
  const second = makeTask({ id: "second", filePath: "./tasks/a.md" });
  const lookup = TaskPathLookup.fromTasks([first, second]);
  expect(lookup.size).toBe(1);
  expect(lookup.get("tasks/a.md")).toBe(second);
});

test("findByRef は完全一致の ref から Task を引き当てる", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  expect(
    TaskPathLookup.findByRef(TaskPathLookup.fromTasks([a]), "tasks/a.md"),
  ).toBe(a);
});

test.each([
  { label: "./ prefix", ref: "./tasks/a.md" },
  { label: "backslash 区切り", ref: "tasks\\a.md" },
])("findByRef は表記揺れ ($label) の ref も引き当てる", ({ ref }) => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  expect(TaskPathLookup.findByRef(TaskPathLookup.fromTasks([a]), ref)).toBe(a);
});

test.each([
  { label: "未登録 path", ref: "tasks/missing.md" },
  { label: "空文字", ref: "" },
  { label: "POSIX 絶対 path", ref: "/tasks/a.md" },
  { label: "Windows 区切り絶対 path", ref: "\\tasks\\a.md" },
  { label: "Windows drive prefix", ref: "C:/tasks/a.md" },
])("findByRef は $label を undefined として返す", ({ ref }) => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  expect(
    TaskPathLookup.findByRef(TaskPathLookup.fromTasks([a]), ref),
  ).toBeUndefined();
});

test("findByRef は空 lookup に対して undefined を返す", () => {
  expect(
    TaskPathLookup.findByRef(TaskPathLookup.fromTasks([]), "tasks/a.md"),
  ).toBeUndefined();
});

test("hasRef は引き当てられる ref に true を返す", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  expect(
    TaskPathLookup.hasRef(TaskPathLookup.fromTasks([a]), "./tasks/a.md"),
  ).toBe(true);
});

test.each([
  { label: "未登録 path", ref: "tasks/missing.md" },
  { label: "正規化できない空文字", ref: "" },
])("hasRef は $label に false を返す", ({ ref }) => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  expect(TaskPathLookup.hasRef(TaskPathLookup.fromTasks([a]), ref)).toBe(false);
});
