import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

const baseLinks = (linkedFilePaths: string[]): TaskLinks => ({
  linkedFilePaths,
  reverseLinkedFilePaths: ["tasks/r.md"],
});

test("restoreLinkedFilePathsIfStillOptimistic は current==optimistic なら snapshot.linkedFilePaths を current にマージして返す", () => {
  const snapshot = baseLinks(["tasks/a.md"]);
  const optimistic = baseLinks(["tasks/a.md", "tasks/b.md"]);
  const current = baseLinks(["tasks/a.md", "tasks/b.md"]);

  const restored = TaskLinks.restoreLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toEqual({
    linkedFilePaths: ["tasks/a.md"],
    reverseLinkedFilePaths: current.reverseLinkedFilePaths,
  });
});

test("restoreLinkedFilePathsIfStillOptimistic は別 path が追加された current で undefined を返す", () => {
  const snapshot = baseLinks(["tasks/a.md"]);
  const optimistic = baseLinks(["tasks/a.md", "tasks/b.md"]);
  const current = baseLinks(["tasks/a.md", "tasks/b.md", "tasks/c.md"]);

  const restored = TaskLinks.restoreLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toBeUndefined();
});

test("restoreLinkedFilePathsIfStillOptimistic は順序が変わった current で undefined を返す", () => {
  const snapshot = baseLinks([]);
  const optimistic = baseLinks(["tasks/a.md", "tasks/b.md"]);
  const current = baseLinks(["tasks/b.md", "tasks/a.md"]);

  const restored = TaskLinks.restoreLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toBeUndefined();
});

test("restoreLinkedFilePathsIfStillOptimistic は楽観 path が消えた current で undefined を返す", () => {
  const snapshot = baseLinks(["tasks/a.md"]);
  const optimistic = baseLinks(["tasks/a.md", "tasks/b.md"]);
  const current = baseLinks(["tasks/a.md"]);

  const restored = TaskLinks.restoreLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toBeUndefined();
});
