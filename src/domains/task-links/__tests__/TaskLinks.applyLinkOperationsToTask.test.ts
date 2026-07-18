import { expect, test } from "vitest";
import { TaskLinks } from "@/domains/task-links";
import { makeTask } from "../../__tests__/taskFixtures";

test("forward append が linkedFilePaths 末尾に反映される", () => {
  const task = makeTask({ id: "a", filePath: "tasks/a.md" });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual(["tasks/b.md"]);
  expect(applied.links.reverseLinkedFilePaths).toEqual([]);
});

test("reverse append が reverseLinkedFilePaths 末尾に追加される", () => {
  const task = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/c.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(applied.links.reverseLinkedFilePaths).toEqual([
    "tasks/c.md",
    "tasks/a.md",
  ]);
});

test("reverse remove が反映される", () => {
  const task = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md", "tasks/c.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(applied.links.reverseLinkedFilePaths).toEqual(["tasks/c.md"]);
});

test("同一 task への複数 operations は 1 回の適用で併合される（self-link 相当）", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/a.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
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

  expect(applied.links.linkedFilePaths).toEqual([]);
  expect(applied.links.reverseLinkedFilePaths).toEqual([]);
});

test("at 指定の forward append は元位置に挿入される", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "tasks/c.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/x.md",
      at: 1,
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual([
    "tasks/b.md",
    "tasks/x.md",
    "tasks/c.md",
  ]);
});

test("at 指定の reverse append は元位置に挿入される", () => {
  const task = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/c.md", "tasks/d.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
      at: 0,
    },
  ]);

  expect(applied.links.reverseLinkedFilePaths).toEqual([
    "tasks/a.md",
    "tasks/c.md",
    "tasks/d.md",
  ]);
});

test("at が現在長を超える場合は末尾へ clamp して挿入される", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/x.md",
      at: 5,
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual(["tasks/b.md", "tasks/x.md"]);
});

test("remove は value 完全一致の全エントリを一括除去する", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "tasks/c.md", "tasks/b.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual(["tasks/c.md"]);
});

test("空 operations は同一参照を返す", () => {
  const task = makeTask({ id: "a", filePath: "tasks/a.md" });

  expect(TaskLinks.applyLinkOperationsToTask(task, [])).toBe(task);
});

test("既に含まれる値の forward append は同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);

  expect(applied).toBe(task);
});

test("既に含まれる値の reverse append は同一参照を返す", () => {
  const task = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(applied).toBe(task);
});

test("不在の値の remove は同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/x.md",
    },
  ]);

  expect(applied).toBe(task);
});

test("filePath が一致しない operation は無視され同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: "tasks/other.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);

  expect(applied).toBe(task);
});
