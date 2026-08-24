import { expect, test } from "vitest";
import {
  makeTask,
  taskFilePathFixture,
} from "@/domains/__tests__/taskFixtures";
import { TaskHierarchy } from "@/domains/task-hierarchy";

test("detachDeletedTask は削除済み task を指す parent を clear する", () => {
  const task = makeTask({
    id: "child",
    parent: taskFilePathFixture("tasks/deleted.md"),
  });

  const next = TaskHierarchy.detachDeletedTask(
    task,
    taskFilePathFixture("tasks/deleted.md"),
  );

  expect(next.hierarchy.parentFilePath).toBeUndefined();
  expect(next.hierarchy.childFilePaths).toBe(task.hierarchy.childFilePaths);
});

test("detachDeletedTask は parent path の表記ゆれを扱える", () => {
  const task = makeTask({
    id: "child",
    parent: ".\\tasks\\deleted.md",
  });

  const next = TaskHierarchy.detachDeletedTask(
    task,
    taskFilePathFixture("tasks/deleted.md"),
  );

  expect(next.hierarchy.parentFilePath).toBeUndefined();
});

test("detachDeletedTask は children から削除済み filePath を取り除く", () => {
  const task = makeTask({
    id: "parent",
    children: [
      taskFilePathFixture("tasks/deleted.md"),
      taskFilePathFixture("tasks/kept.md"),
    ],
  });

  const next = TaskHierarchy.detachDeletedTask(
    task,
    taskFilePathFixture("tasks/deleted.md"),
  );

  expect(next.hierarchy.parentFilePath).toBe(task.hierarchy.parentFilePath);
  expect(next.hierarchy.childFilePaths).toEqual([
    taskFilePathFixture("tasks/kept.md"),
  ]);
});

test("detachDeletedTask は hierarchy 関係が変わらなければ元 task object を返す", () => {
  const task = makeTask({
    id: "a",
    parent: taskFilePathFixture("tasks/parent.md"),
    children: [taskFilePathFixture("tasks/child.md")],
  });

  const next = TaskHierarchy.detachDeletedTask(
    task,
    taskFilePathFixture("tasks/deleted.md"),
  );

  expect(next).toBe(task);
});
