import { expect, test } from "vitest";
import { makeTask, warn } from "@/domains/__tests__/taskFixtures";
import type { TaskWarningCode } from "@/types/task";
import { hasParseError } from "..";

test.each<{ code: TaskWarningCode }>([
  { code: "invalidTitleUsedFileName" },
  { code: "invalidStatusUsedDefault" },
  { code: "invalidParentIgnored" },
  { code: "nonStringExtraKeyIgnored" },
  { code: "extraValueNotJsonCompatible" },
])("invalid 系コード $code 単独で true", ({ code }) => {
  const task = makeTask({ id: "x", warnings: [warn(code)] });
  expect(hasParseError(task)).toBe(true);
});

test("warnings 空で false", () => {
  const task = makeTask({ id: "x", warnings: [] });
  expect(hasParseError(task)).toBe(false);
});

test.each<{ code: TaskWarningCode }>([
  { code: "parentCycle" },
  { code: "parentNotFound" },
  { code: "missingTitleUsedFileName" },
  { code: "missingStatusUsedDefault" },
])("除外コード $code のみで false", ({ code }) => {
  const task = makeTask({ id: "x", warnings: [warn(code)] });
  expect(hasParseError(task)).toBe(false);
});

test("invalid + 除外コード混在で true（invalid が 1 つでもあれば true）", () => {
  const task = makeTask({
    id: "x",
    warnings: [warn("invalidStatusUsedDefault"), warn("parentCycle")],
  });
  expect(hasParseError(task)).toBe(true);
});

test("1 タスクに invalid 複数で true（重複検出しない）", () => {
  const task = makeTask({
    id: "x",
    warnings: [warn("invalidStatusUsedDefault"), warn("invalidParentIgnored")],
  });
  expect(hasParseError(task)).toBe(true);
});
