import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

test("複数 task の operations から出現順に filePath を列挙する", () => {
  const filePaths = TaskLinks.linkOperationTargetFilePaths([
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(filePaths).toEqual(["tasks/a.md", "tasks/b.md"]);
});

test("同一 filePath への複数 operations は 1 回だけ列挙される（self-link 相当）", () => {
  const filePaths = TaskLinks.linkOperationTargetFilePaths([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/a.md",
    },
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(filePaths).toEqual(["tasks/a.md"]);
});

test("空 operations は空配列を返す", () => {
  expect(TaskLinks.linkOperationTargetFilePaths([])).toEqual([]);
});
