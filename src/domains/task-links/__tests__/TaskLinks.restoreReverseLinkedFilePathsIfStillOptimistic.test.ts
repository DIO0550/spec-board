import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";

const baseLinks = (reverseLinkedFilePaths: string[]): TaskLinks => ({
  linkedFilePaths: ["tasks/l.md"],
  reverseLinkedFilePaths,
});

test("restoreReverseLinkedFilePathsIfStillOptimistic は current==optimistic なら snapshot.reverseLinkedFilePaths を current にマージして返す", () => {
  const snapshot = baseLinks(["tasks/x.md"]);
  const optimistic = baseLinks(["tasks/x.md", "tasks/y.md"]);
  const current = baseLinks(["tasks/x.md", "tasks/y.md"]);

  const restored = TaskLinks.restoreReverseLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toEqual({
    linkedFilePaths: current.linkedFilePaths,
    reverseLinkedFilePaths: ["tasks/x.md"],
  });
});

test("restoreReverseLinkedFilePathsIfStillOptimistic は別 path が追加された current で undefined を返す", () => {
  const snapshot = baseLinks([]);
  const optimistic = baseLinks(["tasks/x.md"]);
  const current = baseLinks(["tasks/x.md", "tasks/z.md"]);

  const restored = TaskLinks.restoreReverseLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toBeUndefined();
});

test("restoreReverseLinkedFilePathsIfStillOptimistic は順序が変わった current で undefined を返す", () => {
  const snapshot = baseLinks([]);
  const optimistic = baseLinks(["tasks/x.md", "tasks/y.md"]);
  const current = baseLinks(["tasks/y.md", "tasks/x.md"]);

  const restored = TaskLinks.restoreReverseLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toBeUndefined();
});

test("restoreReverseLinkedFilePathsIfStillOptimistic は楽観 path が消えた current で undefined を返す", () => {
  const snapshot = baseLinks(["tasks/x.md"]);
  const optimistic = baseLinks(["tasks/x.md", "tasks/y.md"]);
  const current = baseLinks(["tasks/x.md"]);

  const restored = TaskLinks.restoreReverseLinkedFilePathsIfStillOptimistic({
    snapshot,
    optimistic,
    current,
  });

  expect(restored).toBeUndefined();
});
