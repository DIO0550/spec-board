import { expect, test } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { TaskLinks } from "@/domains/task-links";

test("複数 task の operations から出現順に filePath を列挙する", () => {
  const filePaths = TaskLinks.linkOperationTargetFilePaths([
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/b.md"),
    },
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/b.md"),
      field: "reverseLinkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
    },
  ]);

  expect(filePaths).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/b.md"),
  ]);
});

test("同一 filePath への複数 operations は 1 回だけ列挙される（self-link 相当）", () => {
  const filePaths = TaskLinks.linkOperationTargetFilePaths([
    {
      op: "remove",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
    },
    {
      op: "remove",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "reverseLinkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
    },
  ]);

  expect(filePaths).toEqual([taskFilePathFixture("tasks/a.md")]);
});

test("空 operations は空配列を返す", () => {
  expect(TaskLinks.linkOperationTargetFilePaths([])).toEqual([]);
});
