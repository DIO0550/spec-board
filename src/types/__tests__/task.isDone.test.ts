import { expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";

/**
 * テスト用の Task を生成するファクトリ。
 * @param overrides - 上書きするフィールド
 * @returns Task オブジェクト
 */
const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
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

test("Task.isDone は status が doneColumn と一致すれば true", () => {
  const task = makeTask({ status: "Done" });
  expect(Task.isDone(task, "Done")).toBe(true);
});

test("Task.isDone は status が doneColumn と異なれば false", () => {
  const task = makeTask({ status: "In Progress" });
  expect(Task.isDone(task, "Done")).toBe(false);
});

test("Task.isDone は doneColumn が undefined のとき常に false", () => {
  const task = makeTask({ status: "Done" });
  expect(Task.isDone(task, undefined)).toBe(false);
});
