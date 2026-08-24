import { expect, test } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
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
    filePath: taskFilePathFixture("tasks/x.md"),
    ...overrides,
  });

const tasksOf = (
  pairs: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<Task> =>
  pairs.map(([filePath, status]) => makeTask({ filePath, status }));

test("カラム間移動: 移動先カラムに target が含まれない状態から toIndex に挿入", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Done"],
    [taskFilePathFixture("tasks/c.md"), "Done"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/a.md"),
    "Todo",
    "Done",
    1,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("同一カラム下方向移動: 元 0 → hover toIndex 2（B と C の間）で B,A,C", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/a.md"),
    "Todo",
    "Todo",
    2,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("同一カラム下方向移動: 元 0 → hover toIndex 3（末尾）で B,C,A", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/a.md"),
    "Todo",
    "Todo",
    3,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("同一カラム上方向移動（元 2 → toIndex 0）で C,A,B", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/c.md"),
    "Todo",
    "Todo",
    0,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});

test("カラム間移動: 末尾（toIndex = toColumn 内 length）で末尾配置", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Done"],
    [taskFilePathFixture("tasks/c.md"), "Done"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/a.md"),
    "Todo",
    "Done",
    2,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("toIndex 超過時の clamp（toIndex > length → 末尾）", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Done"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/a.md"),
    "Todo",
    "Done",
    999,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("空カラムへの移動（toIndex=0）で target 単独が返る", () => {
  const tasks = tasksOf([[taskFilePathFixture("tasks/a.md"), "Todo"]]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/a.md"),
    "Todo",
    "Done",
    0,
  );
  expect(result).toEqual([taskFilePathFixture("tasks/a.md")]);
});

test("同一カラムで元位置と同じ hover 位置（toIndex = 元 index + 1）なら結果が元配列と一致", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/b.md"),
    "Todo",
    "Todo",
    2,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("同一カラムで toIndex = 元 index なら結果が元配列と一致", () => {
  const tasks = tasksOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const result = buildMovedFilePaths(
    tasks,
    taskFilePathFixture("tasks/b.md"),
    "Todo",
    "Todo",
    1,
  );
  expect(result).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/c.md"),
  ]);
});
