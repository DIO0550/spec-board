import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

test("removeReverseLinkedFilePath は reverseLinkedFilePaths から source だけを除いた配列を返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/l.md"],
    reverseLinkedFilePaths: ["tasks/r1.md", "tasks/r2.md", "tasks/r3.md"],
  };

  const next = TaskLinks.removeReverseLinkedFilePath(links, "tasks/r2.md");

  expect(next.reverseLinkedFilePaths).toEqual(["tasks/r1.md", "tasks/r3.md"]);
});

test("removeReverseLinkedFilePath は linkedFilePaths を同一参照で保持する", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/l.md"],
    reverseLinkedFilePaths: ["tasks/r.md"],
  };

  const next = TaskLinks.removeReverseLinkedFilePath(links, "tasks/r.md");

  expect(next.linkedFilePaths).toBe(links.linkedFilePaths);
});

test("removeReverseLinkedFilePath は含まれない source で元の links を同一参照で返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: [],
    reverseLinkedFilePaths: ["tasks/r.md"],
  };

  const next = TaskLinks.removeReverseLinkedFilePath(links, "tasks/missing.md");

  expect(next).toBe(links);
});

test("removeReverseLinkedFilePath は空配列でも例外を出さず元 links を同一参照で返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: [],
    reverseLinkedFilePaths: [],
  };

  const next = TaskLinks.removeReverseLinkedFilePath(links, "tasks/r.md");

  expect(next).toBe(links);
});
