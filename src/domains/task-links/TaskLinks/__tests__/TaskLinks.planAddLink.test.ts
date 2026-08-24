import { expect, test } from "vitest";
import {
  makeTask,
  taskFilePathFixture,
} from "@/domains/__tests__/taskFixtures";
import { TaskLinks } from "@/domains/task-links";

test("未リンクの 2 タスク間では apply と forward/reverse の 2 operations を返す", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan).toEqual({
    kind: "apply",
    optimistic: [
      {
        op: "append",
        filePath: taskFilePathFixture("tasks/a.md"),
        field: "linkedFilePaths",
        value: taskFilePathFixture("tasks/b.md"),
      },
      {
        op: "append",
        filePath: taskFilePathFixture("tasks/b.md"),
        field: "reverseLinkedFilePaths",
        value: taskFilePathFixture("tasks/a.md"),
        requiresValueTask: true,
      },
    ],
    rollback: [
      {
        op: "remove",
        filePath: taskFilePathFixture("tasks/b.md"),
        field: "reverseLinkedFilePaths",
        value: taskFilePathFixture("tasks/a.md"),
      },
      {
        op: "remove",
        filePath: taskFilePathFixture("tasks/a.md"),
        field: "linkedFilePaths",
        value: taskFilePathFixture("tasks/b.md"),
      },
    ],
  });
});

test("target が既に reverse を持つ場合は forward の 1 operation のみを返す", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan).toEqual({
    kind: "apply",
    optimistic: [
      {
        op: "append",
        filePath: taskFilePathFixture("tasks/a.md"),
        field: "linkedFilePaths",
        value: taskFilePathFixture("tasks/b.md"),
      },
    ],
    rollback: [
      {
        op: "remove",
        filePath: taskFilePathFixture("tasks/a.md"),
        field: "linkedFilePaths",
        value: taskFilePathFixture("tasks/b.md"),
      },
    ],
  });
});

test("links / reverseLinks が空の task への初回 add は apply を返す", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [],
    reverseLinks: [],
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    links: [],
    reverseLinks: [],
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan.kind).toBe("apply");
});

test("既リンク済みは noop を返し task は source の同一参照", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan).toEqual({ kind: "noop", task: source });
  expect(plan.kind === "noop" && plan.task === source).toBe(true);
});

test("既存 raw 表記 ./tasks/b.md への canonical tasks/b.md の add は noop（正規化同値判定）", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: ["./tasks/b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan.kind).toBe("noop");
});

test("既存の重複区切り表記 tasks//b.md への canonical add も noop（正規化同値判定）", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks//b.md")],
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan.kind).toBe("noop");
});

test("既リンク済みで target reverse が欠落していても noop（ドリフト残置の仕様固定）", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/b.md")],
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [],
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(plan).toEqual({ kind: "noop", task: source });
});

test("self-link は rejected（reason: self-link）を返す", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: source.filePath,
    source,
    target: source,
  });

  expect(plan).toEqual({ kind: "rejected", reason: "self-link" });
});

test("source 不在は rejected（reason: source-not-found）を返す", () => {
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: target.filePath,
    source: undefined,
    target,
  });

  expect(plan).toEqual({ kind: "rejected", reason: "source-not-found" });
});

test("target 不在は rejected（reason: target-not-found）を返す", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
  });

  const plan = TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: taskFilePathFixture("tasks/missing.md"),
    source,
    target: undefined,
  });

  expect(plan).toEqual({ kind: "rejected", reason: "target-not-found" });
});

test("source 不在かつ self-link 指定では source-not-found が優先される", () => {
  const plan = TaskLinks.planAddLink({
    sourceFilePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/a.md"),
    source: undefined,
    target: undefined,
  });

  expect(plan).toEqual({ kind: "rejected", reason: "source-not-found" });
});

test("plan 呼出は入力 Task の links 配列を破壊しない", () => {
  const source = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [taskFilePathFixture("tasks/c.md")],
  });
  const target = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    reverseLinks: [taskFilePathFixture("tasks/d.md")],
  });

  TaskLinks.planAddLink({
    sourceFilePath: source.filePath,
    targetFilePath: target.filePath,
    source,
    target,
  });

  expect(source.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
  expect(source.links.reverseLinkedFilePaths).toEqual([]);
  expect(target.links.linkedFilePaths).toEqual([]);
  expect(target.links.reverseLinkedFilePaths).toEqual([
    taskFilePathFixture("tasks/d.md"),
  ]);
});
