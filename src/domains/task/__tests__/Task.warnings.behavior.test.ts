import { expect, test } from "vitest";
import { makeTask, warn } from "@/domains/__tests__/taskFixtures";
import { buildTasksByNormalizedPath } from "@/domains/broken-link";
import type { TaskWarningCode } from "..";
import { Task } from "..";

const PARSE_ERROR_CODES: readonly TaskWarningCode[] = [
  "invalidTitleUsedFileName",
  "invalidStatusUsedDefault",
  "invalidParentIgnored",
  "nonStringExtraKeyIgnored",
  "extraValueNotJsonCompatible",
];

test.each(
  PARSE_ERROR_CODES.map((code) => ({ code })),
)("hasParseIssues は $code 単独で true / hasCycle は false / warnings は同 array", ({
  code,
}) => {
  const task = makeTask({ id: "t", warnings: [warn(code)] });
  expect(Task.hasParseIssues(task)).toBe(true);
  expect(Task.hasCycle(task)).toBe(false);
  expect(Task.warnings(task)).toEqual([warn(code)]);
});

test("hasCycle は parentCycle 単独で true / hasParseIssues は false", () => {
  const task = makeTask({ id: "t", warnings: [warn("parentCycle")] });
  expect(Task.hasCycle(task)).toBe(true);
  expect(Task.hasParseIssues(task)).toBe(false);
  expect(Task.warnings(task)).toEqual([warn("parentCycle")]);
});

test("hasParseIssues と hasCycle は parse-issue + cycle 混在で両方 true", () => {
  const warnings = [warn("invalidStatusUsedDefault"), warn("parentCycle")];
  const task = makeTask({ id: "t", warnings });
  expect(Task.hasParseIssues(task)).toBe(true);
  expect(Task.hasCycle(task)).toBe(true);
  expect(Task.warnings(task)).toEqual(warnings);
});

test("warnings 空で 3 predicate すべて false", () => {
  const task = makeTask({ id: "t", warnings: [] });
  expect(Task.hasParseIssues(task)).toBe(false);
  expect(Task.hasCycle(task)).toBe(false);
  expect(Task.warnings(task)).toEqual([]);
});

test.each<{ code: TaskWarningCode }>([
  { code: "parentNotFound" },
  { code: "missingTitleUsedFileName" },
  { code: "missingStatusUsedDefault" },
  { code: "invalidDue" },
])("非対象コード $code のみで hasParseIssues と hasCycle は false", ({
  code,
}) => {
  const task = makeTask({ id: "t", warnings: [warn(code)] });
  expect(Task.hasParseIssues(task)).toBe(false);
  expect(Task.hasCycle(task)).toBe(false);
});

test("hasBrokenLinks は 空 refs で false", () => {
  const task = makeTask({ id: "t", filePath: "tasks/t.md" });
  const map = buildTasksByNormalizedPath([task]);
  expect(Task.hasBrokenLinks(task, { tasksByPath: map })).toBe(false);
});

test("hasBrokenLinks は 1 link が broken で true", () => {
  const task = makeTask({
    id: "t",
    filePath: "tasks/t.md",
    links: ["tasks/missing.md"],
  });
  const map = buildTasksByNormalizedPath([task]);
  expect(Task.hasBrokenLinks(task, { tasksByPath: map })).toBe(true);
});

test("hasBrokenLinks は 全 link が resolvable で false", () => {
  const other = makeTask({ id: "o", filePath: "tasks/o.md" });
  const task = makeTask({
    id: "t",
    filePath: "tasks/t.md",
    links: ["tasks/o.md"],
  });
  const map = buildTasksByNormalizedPath([task, other]);
  expect(Task.hasBrokenLinks(task, { tasksByPath: map })).toBe(false);
});

test("hasBrokenLinks は parent broken で true", () => {
  const task = makeTask({
    id: "t",
    filePath: "tasks/t.md",
    parent: "tasks/missing-parent.md",
  });
  const map = buildTasksByNormalizedPath([task]);
  expect(Task.hasBrokenLinks(task, { tasksByPath: map })).toBe(true);
});

test("hasBrokenLinks は tasksByPath 空 Map で全参照 broken → true", () => {
  const task = makeTask({
    id: "t",
    filePath: "tasks/t.md",
    parent: "tasks/p.md",
  });
  const map = buildTasksByNormalizedPath([]);
  expect(Task.hasBrokenLinks(task, { tasksByPath: map })).toBe(true);
});
