import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { buildTasksByNormalizedPath } from "..";

test("複数タスクから Map が構築され Task.filePath で引ける", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  const b = makeTask({ id: "b", filePath: "tasks/b.md" });
  const map = buildTasksByNormalizedPath([a, b]);
  expect(map.get("tasks/a.md")).toBe(a);
  expect(map.get("tasks/b.md")).toBe(b);
});

test("空配列なら empty Map", () => {
  const map = buildTasksByNormalizedPath([]);
  expect(map.size).toBe(0);
});

test("Task.filePath が `./tasks/x.md` 形式でも normalize key で引ける", () => {
  const a = makeTask({ id: "a", filePath: "./tasks/a.md" });
  const map = buildTasksByNormalizedPath([a]);
  expect(map.get("tasks/a.md")).toBe(a);
});

test("Task.filePath が `tasks\\x.md` 形式でも normalize key で引ける", () => {
  const a = makeTask({ id: "a", filePath: "tasks\\a.md" });
  const map = buildTasksByNormalizedPath([a]);
  expect(map.get("tasks/a.md")).toBe(a);
});
