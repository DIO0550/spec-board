import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

test("appendLinkedFilePath は新規 target を linkedFilePaths の末尾に追加する", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/a.md"],
    reverseLinkedFilePaths: ["tasks/r.md"],
  };

  const next = TaskLinks.appendLinkedFilePath(links, "tasks/b.md");

  expect(next.linkedFilePaths).toEqual(["tasks/a.md", "tasks/b.md"]);
  expect(next.reverseLinkedFilePaths).toBe(links.reverseLinkedFilePaths);
});

test("appendLinkedFilePath は既に含まれる target で元の links を同一参照で返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/a.md"],
    reverseLinkedFilePaths: [],
  };

  const next = TaskLinks.appendLinkedFilePath(links, "tasks/a.md");

  expect(next).toBe(links);
});
