import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskLinks } from "@/domains/task-links";

test("removeLinkedTask は links から指定 filePath を取り除く", () => {
  const task = makeTask({
    id: "a",
    links: ["tasks/deleted.md", "tasks/kept.md"],
  });

  const next = TaskLinks.removeLinkedTask(task, "tasks/deleted.md");

  expect(next.links).toEqual(["tasks/kept.md"]);
  expect(next.reverseLinks).toBe(task.reverseLinks);
});

test("removeLinkedTask は reverseLinks から指定 filePath を取り除く", () => {
  const task = makeTask({
    id: "a",
    reverseLinks: ["tasks/deleted.md", "tasks/kept.md"],
  });

  const next = TaskLinks.removeLinkedTask(task, "tasks/deleted.md");

  expect(next.links).toBe(task.links);
  expect(next.reverseLinks).toEqual(["tasks/kept.md"]);
});

test("removeLinkedTask は links と reverseLinks の両方を一度に掃除する", () => {
  const task = makeTask({
    id: "a",
    links: ["tasks/deleted.md"],
    reverseLinks: ["tasks/deleted.md"],
  });

  const next = TaskLinks.removeLinkedTask(task, "tasks/deleted.md");

  expect(next.links).toEqual([]);
  expect(next.reverseLinks).toEqual([]);
});

test("removeLinkedTask は link 関係が変わらなければ元 task object を返す", () => {
  const task = makeTask({
    id: "a",
    links: ["tasks/linked.md"],
    reverseLinks: ["tasks/reverse.md"],
  });

  const next = TaskLinks.removeLinkedTask(task, "tasks/deleted.md");

  expect(next).toBe(task);
});
