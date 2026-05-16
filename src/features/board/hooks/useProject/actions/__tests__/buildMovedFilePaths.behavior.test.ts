import { expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { buildMovedFilePaths } from "../buildMovedFilePaths";

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

const tasksOf = (
  pairs: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<Task> =>
  pairs.map(([filePath, status]) => makeTask({ filePath, status }));

test("カラム間移動: 移動先カラムに target が含まれない状態から toIndex に挿入", () => {
  const tasks = tasksOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Done"],
    ["tasks/c.md", "Done"],
  ]);
  const result = buildMovedFilePaths(tasks, "tasks/a.md", "Done", 1);
  expect(result).toEqual(["tasks/b.md", "tasks/a.md", "tasks/c.md"]);
});

test("同一カラム下方向移動（元 0 → toIndex 2）で重複なし", () => {
  const tasks = tasksOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Todo"],
    ["tasks/c.md", "Todo"],
  ]);
  const result = buildMovedFilePaths(tasks, "tasks/a.md", "Todo", 2);
  expect(result).toEqual(["tasks/b.md", "tasks/c.md", "tasks/a.md"]);
});

test("同一カラム上方向移動（元 2 → toIndex 0）で重複なし", () => {
  const tasks = tasksOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Todo"],
    ["tasks/c.md", "Todo"],
  ]);
  const result = buildMovedFilePaths(tasks, "tasks/c.md", "Todo", 0);
  expect(result).toEqual(["tasks/c.md", "tasks/a.md", "tasks/b.md"]);
});

test("末尾への移動（toIndex = length）で末尾配置", () => {
  const tasks = tasksOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Done"],
    ["tasks/c.md", "Done"],
  ]);
  const result = buildMovedFilePaths(tasks, "tasks/a.md", "Done", 2);
  expect(result).toEqual(["tasks/b.md", "tasks/c.md", "tasks/a.md"]);
});

test("toIndex 超過時の clamp（toIndex > length → 末尾）", () => {
  const tasks = tasksOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Done"],
  ]);
  const result = buildMovedFilePaths(tasks, "tasks/a.md", "Done", 999);
  expect(result).toEqual(["tasks/b.md", "tasks/a.md"]);
});

test("空カラムへの移動（toIndex=0）で target 単独が返る", () => {
  const tasks = tasksOf([["tasks/a.md", "Todo"]]);
  const result = buildMovedFilePaths(tasks, "tasks/a.md", "Done", 0);
  expect(result).toEqual(["tasks/a.md"]);
});

test("同一カラムで結果が元配列と完全一致（no-op 判定用）", () => {
  const tasks = tasksOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Todo"],
    ["tasks/c.md", "Todo"],
  ]);
  const result = buildMovedFilePaths(tasks, "tasks/b.md", "Todo", 1);
  expect(result).toEqual(["tasks/a.md", "tasks/b.md", "tasks/c.md"]);
});
