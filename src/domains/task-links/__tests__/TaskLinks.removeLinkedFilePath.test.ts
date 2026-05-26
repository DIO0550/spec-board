import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

test("removeLinkedFilePath は linkedFilePaths から target だけを除いた配列を返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/a.md", "tasks/b.md", "tasks/c.md"],
    reverseLinkedFilePaths: ["tasks/r.md"],
  };

  const next = TaskLinks.removeLinkedFilePath(links, "tasks/b.md");

  expect(next.linkedFilePaths).toEqual(["tasks/a.md", "tasks/c.md"]);
});

test("removeLinkedFilePath は reverseLinkedFilePaths を同一参照で保持する", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/a.md"],
    reverseLinkedFilePaths: ["tasks/r.md"],
  };

  const next = TaskLinks.removeLinkedFilePath(links, "tasks/a.md");

  expect(next.reverseLinkedFilePaths).toBe(links.reverseLinkedFilePaths);
});

test("removeLinkedFilePath は含まれない target で元の links を同一参照で返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/a.md"],
    reverseLinkedFilePaths: [],
  };

  const next = TaskLinks.removeLinkedFilePath(links, "tasks/missing.md");

  expect(next).toBe(links);
});

test("removeLinkedFilePath は空配列でも例外を出さず元 links を同一参照で返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: [],
    reverseLinkedFilePaths: [],
  };

  const next = TaskLinks.removeLinkedFilePath(links, "tasks/a.md");

  expect(next).toBe(links);
});
