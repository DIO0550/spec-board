import { expect, test } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { SubIssue } from "..";

/**
 * テスト用の Task を生成するファクトリ。
 * @param overrides - 上書きするフィールド
 * @returns Task オブジェクト
 */
const makeTask = (overrides: Partial<TaskFromPayloadInput>): Task =>
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

test("SubIssue.filter(undefined) は空配列を返す", () => {
  expect(SubIssue.filter(undefined, "/parent")).toEqual([]);
});

test("SubIssue.filter は parent が一致する子タスクのみを返す", () => {
  const t1 = makeTask({ id: "1", filePath: "/1", parent: "/parent" });
  const t2 = makeTask({ id: "2", filePath: "/2", parent: "/other" });
  const t3 = makeTask({ id: "3", filePath: "/3", parent: "/parent" });
  expect(SubIssue.filter([t1, t2, t3], "/parent")).toEqual([t1, t3]);
});

test("SubIssue.filter は parent の軽量正規化で子タスクを返す", () => {
  const t1 = makeTask({
    id: "1",
    filePath: "tasks/1.md",
    parent: "./tasks/parent.md",
  });
  const t2 = makeTask({
    id: "2",
    filePath: "tasks/2.md",
    parent: "tasks\\parent.md",
  });
  const t3 = makeTask({
    id: "3",
    filePath: "tasks/3.md",
    parent: "/tasks/parent.md",
  });

  expect(SubIssue.filter([t1, t2, t3], "tasks/parent.md")).toEqual([t1, t2]);
});

test("SubIssue.filter は該当なしの場合に空配列を返す", () => {
  const t1 = makeTask({ id: "1", parent: "/other" });
  expect(SubIssue.filter([t1], "/parent")).toEqual([]);
});
