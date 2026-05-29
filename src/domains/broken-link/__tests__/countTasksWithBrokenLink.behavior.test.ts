import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { buildTasksByNormalizedPath, countTasksWithBrokenLink } from "..";

test("broken 0 件: count=0", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  const tasks = [a];
  expect(
    countTasksWithBrokenLink(tasks, buildTasksByNormalizedPath(tasks)),
  ).toBe(0);
});

test("broken 1 件: count=1", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  const x = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/missing.md",
  });
  const tasks = [a, x];
  expect(
    countTasksWithBrokenLink(tasks, buildTasksByNormalizedPath(tasks)),
  ).toBe(1);
});

test("複数件: 各タスクは独立にカウント", () => {
  const x = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/missing.md",
  });
  const y = makeTask({
    id: "y",
    filePath: "tasks/y.md",
    links: ["tasks/dead.md"],
  });
  const tasks = [x, y];
  expect(
    countTasksWithBrokenLink(tasks, buildTasksByNormalizedPath(tasks)),
  ).toBe(2);
});

test("1 タスクが複数種類 broken でもカウントは 1", () => {
  const x = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/missing.md",
    links: ["tasks/dead.md"],
    children: ["tasks/orphan.md"],
    reverseLinks: ["tasks/gone.md"],
  });
  const tasks = [x];
  expect(
    countTasksWithBrokenLink(tasks, buildTasksByNormalizedPath(tasks)),
  ).toBe(1);
});
