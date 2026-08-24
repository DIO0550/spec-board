import { expect, test } from "vitest";
import {
  makeTask,
  taskFilePathFixture,
} from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import type { Column } from "@/types/column";
import { ProjectData, type ProjectData as ProjectDataT } from "..";

const columns = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

const dataOf = (
  pairs: ReadonlyArray<readonly [string, string]>,
): ProjectDataT => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: pairs.map(([filePath, status]) =>
    makeTask({ id: filePath, filePath, status }),
  ),
  columns: columns("Todo", "Done"),
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
});

test("対象カラム内のタスクを filePaths 順に並べ替える", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});

test("他カラムのタスク順序は維持される", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/x.md"), "Done"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/y.md"), "Done"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/x.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/y.md"),
  ]);
});

test("filePaths に含まれないタスクは末尾にフォールバック配置（元出現順を維持）", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
    [taskFilePathFixture("tasks/c.md"), "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    taskFilePathFixture("tasks/c.md"),
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});

test("tasks.length は前後で変化しない", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/x.md"), "Done"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
  expect(next.tasks.length).toBe(data.tasks.length);
});

test("filePaths に含まれる未知の path は無視される", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    taskFilePathFixture("tasks/unknown.md"),
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("重複 filePaths が渡された場合の挙動を記録する (BE normalize 済みの前提)", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
  // ordered は [b, b, a] の 3 件だが data.tasks.map が 2 件に制限する。
  // BE が重複を排除するため実運用では発生しない。挙動の記録目的。
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});

test("空の filePaths が渡された場合は全タスクが fallback 配置される", () => {
  const data = dataOf([
    [taskFilePathFixture("tasks/a.md"), "Todo"],
    [taskFilePathFixture("tasks/b.md"), "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", []);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});
