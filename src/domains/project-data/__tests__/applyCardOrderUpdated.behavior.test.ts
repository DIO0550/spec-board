import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import type { Column } from "@/types/column";
import { ProjectData, type ProjectData as ProjectDataT } from "..";

const columns = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

const dataOf = (
  pairs: ReadonlyArray<readonly [string, string]>,
): ProjectDataT => ({
  tasks: pairs.map(([filePath, status]) =>
    makeTask({ id: filePath, filePath, status }),
  ),
  columns: columns("Todo", "Done"),
});

test("対象カラム内のタスクを filePaths 順に並べ替える", () => {
  const data = dataOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Todo"],
    ["tasks/c.md", "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    "tasks/c.md",
    "tasks/a.md",
    "tasks/b.md",
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    "tasks/c.md",
    "tasks/a.md",
    "tasks/b.md",
  ]);
});

test("他カラムのタスク順序は維持される", () => {
  const data = dataOf([
    ["tasks/a.md", "Todo"],
    ["tasks/x.md", "Done"],
    ["tasks/b.md", "Todo"],
    ["tasks/y.md", "Done"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    "tasks/b.md",
    "tasks/a.md",
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    "tasks/b.md",
    "tasks/x.md",
    "tasks/a.md",
    "tasks/y.md",
  ]);
});

test("filePaths に含まれないタスクは末尾にフォールバック配置（元出現順を維持）", () => {
  const data = dataOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Todo"],
    ["tasks/c.md", "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", ["tasks/c.md"]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    "tasks/c.md",
    "tasks/a.md",
    "tasks/b.md",
  ]);
});

test("tasks.length は前後で変化しない", () => {
  const data = dataOf([
    ["tasks/a.md", "Todo"],
    ["tasks/x.md", "Done"],
    ["tasks/b.md", "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    "tasks/b.md",
    "tasks/a.md",
  ]);
  expect(next.tasks.length).toBe(data.tasks.length);
});

test("filePaths に含まれる未知の path は無視される", () => {
  const data = dataOf([
    ["tasks/a.md", "Todo"],
    ["tasks/b.md", "Todo"],
  ]);
  const next = ProjectData.applyCardOrderUpdated(data, "Todo", [
    "tasks/unknown.md",
    "tasks/b.md",
    "tasks/a.md",
  ]);
  expect(next.tasks.map((t) => t.filePath)).toEqual([
    "tasks/b.md",
    "tasks/a.md",
  ]);
});
