import { expect, test } from "vitest";
import {
  makeTask,
  taskFilePathFixture,
} from "@/domains/__tests__/taskFixtures";
import { TaskLinks } from "@/domains/task-links";

test("forward append が linkedFilePaths 末尾に反映される", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/b.md"),
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/b.md"),
  ]);
  expect(applied.links.reverseLinkedFilePaths).toEqual([]);
});

test("reverse append が reverseLinkedFilePaths 末尾に追加される", () => {
  const task = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/c.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/b.md"),
      field: "reverseLinkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
    },
  ]);

  expect(applied.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("reverse remove が反映される", () => {
  const task = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [
      taskFilePathFixture("tasks/a.md"),
      taskFilePathFixture("tasks/c.md"),
    ],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: taskFilePathFixture("tasks/b.md"),
      field: "reverseLinkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
    },
  ]);

  expect(applied.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("同一 task への複数 operations は 1 回の適用で併合される（self-link 相当）", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/a.md")],
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
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

  expect(applied.links.linkedFilePaths).toEqual([]);
  expect(applied.links.reverseLinkedFilePaths).toEqual([]);
});

test("at 指定の forward append は元位置に挿入される", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/c.md"),
    ],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/x.md"),
      at: 1,
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/x.md"),
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("at 指定の reverse append は元位置に挿入される", () => {
  const task = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [
      taskFilePathFixture("tasks/c.md"),
      taskFilePathFixture("tasks/d.md"),
    ],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/b.md"),
      field: "reverseLinkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
      at: 0,
    },
  ]);

  expect(applied.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/c.md"),
    taskFilePathFixture("tasks/d.md"),
  ]);
});

test("at が現在長を超える場合は末尾へ clamp して挿入される", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/x.md"),
      at: 5,
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/x.md"),
  ]);
});

test("remove は value 完全一致の全エントリを一括除去する", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/c.md"),
      taskFilePathFixture("tasks/b.md"),
    ],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/b.md"),
    },
  ]);

  expect(applied.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("空 operations は同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
  });

  expect(TaskLinks.applyLinkOperationsToTask(task, [])).toBe(task);
});

test("既に含まれる値の forward append は同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/b.md"),
    },
  ]);

  expect(applied).toBe(task);
});

test("既に含まれる値の reverse append は同一参照を返す", () => {
  const task = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "append",
      filePath: taskFilePathFixture("tasks/b.md"),
      field: "reverseLinkedFilePaths",
      value: taskFilePathFixture("tasks/a.md"),
    },
  ]);

  expect(applied).toBe(task);
});

test("不在の値の remove は同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: taskFilePathFixture("tasks/a.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/x.md"),
    },
  ]);

  expect(applied).toBe(task);
});

test("filePath が一致しない operation は無視され同一参照を返す", () => {
  const task = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });

  const applied = TaskLinks.applyLinkOperationsToTask(task, [
    {
      op: "remove",
      filePath: taskFilePathFixture("tasks/other.md"),
      field: "linkedFilePaths",
      value: taskFilePathFixture("tasks/b.md"),
    },
  ]);

  expect(applied).toBe(task);
});
