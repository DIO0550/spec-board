import { expect, test } from "vitest";
import type { Column, Task } from "@/types/task";
import { SubIssue } from "../index";

/**
 * テスト用の Task を生成するファクトリ。
 * @param overrides - 上書きするフィールド
 * @returns Task オブジェクト
 */
const makeTask = (overrides: Partial<Task>): Task => ({
  id: "id",
  title: "title",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "/p",
  ...overrides,
});

test("SubIssue.filter(undefined) は空配列を返す", () => {
  expect(SubIssue.filter(undefined, "/parent")).toEqual([]);
});

test("SubIssue.filter は parent が一致する子タスクのみを返す", () => {
  const t1 = makeTask({ id: "1", filePath: "/1", parent: "/parent" });
  const t2 = makeTask({ id: "2", filePath: "/2", parent: "/other" });
  const t3 = makeTask({ id: "3", filePath: "/3", parent: "/parent" });
  expect(SubIssue.filter([t1, t2, t3], "/parent")).toEqual([t1, t3]);
});

test("SubIssue.filter は該当なしの場合に空配列を返す", () => {
  const t1 = makeTask({ id: "1", parent: "/other" });
  expect(SubIssue.filter([t1], "/parent")).toEqual([]);
});

test("SubIssue.progress({total:0}) は {0,0,0}", () => {
  expect(SubIssue.progress([], "Done")).toEqual({
    total: 0,
    doneCount: 0,
    percentage: 0,
  });
});

test("SubIssue.progress 全件完了で percentage=100", () => {
  const tasks = [
    makeTask({ id: "1", status: "Done" }),
    makeTask({ id: "2", status: "Done" }),
  ];
  expect(SubIssue.progress(tasks, "Done")).toEqual({
    total: 2,
    doneCount: 2,
    percentage: 100,
  });
});

test("SubIssue.progress 4 件中 2 件 done で percentage=50", () => {
  const tasks = [
    makeTask({ id: "1", status: "Done" }),
    makeTask({ id: "2", status: "Done" }),
    makeTask({ id: "3", status: "Todo" }),
    makeTask({ id: "4", status: "Todo" }),
  ];
  expect(SubIssue.progress(tasks, "Done")).toEqual({
    total: 4,
    doneCount: 2,
    percentage: 50,
  });
});

test("SubIssue.progress 3 件中 1 件 done で percentage=33（Math.round）", () => {
  const tasks = [
    makeTask({ id: "1", status: "Done" }),
    makeTask({ id: "2", status: "Todo" }),
    makeTask({ id: "3", status: "Todo" }),
  ];
  expect(SubIssue.progress(tasks, "Done")).toEqual({
    total: 3,
    doneCount: 1,
    percentage: 33,
  });
});

test("SubIssue.resolveDoneColumn(override 指定) は override を返す", () => {
  const columns: Column[] = [{ name: "A", order: 0 }];
  expect(SubIssue.resolveDoneColumn(columns, "Custom")).toBe("Custom");
});

test('SubIssue.resolveDoneColumn(空 columns) は "Done"', () => {
  expect(SubIssue.resolveDoneColumn([], undefined)).toBe("Done");
});

test("SubIssue.resolveDoneColumn は order 最大のカラムを返す", () => {
  const columns: Column[] = [
    { name: "A", order: 0 },
    { name: "B", order: 5 },
    { name: "C", order: 3 },
  ];
  expect(SubIssue.resolveDoneColumn(columns, undefined)).toBe("B");
});
