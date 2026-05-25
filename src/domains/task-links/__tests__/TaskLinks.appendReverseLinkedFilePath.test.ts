import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

test("appendReverseLinkedFilePath は新規 source を reverseLinkedFilePaths の末尾に追加する", () => {
  const links: TaskLinks = {
    linkedFilePaths: ["tasks/l.md"],
    reverseLinkedFilePaths: ["tasks/x.md"],
  };

  const next = TaskLinks.appendReverseLinkedFilePath(links, "tasks/y.md");

  expect(next.reverseLinkedFilePaths).toEqual(["tasks/x.md", "tasks/y.md"]);
  expect(next.linkedFilePaths).toBe(links.linkedFilePaths);
});

test("appendReverseLinkedFilePath は既に含まれる source で元の links を同一参照で返す", () => {
  const links: TaskLinks = {
    linkedFilePaths: [],
    reverseLinkedFilePaths: ["tasks/x.md"],
  };

  const next = TaskLinks.appendReverseLinkedFilePath(links, "tasks/x.md");

  expect(next).toBe(links);
});
