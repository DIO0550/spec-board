import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { LinkIntent } from "@/domains/task-links";
import { linkReferencesTaskPath } from "@/domains/task-path";
import type { Task } from "@/types/task";

const source = makeTask({ id: "a", filePath: "tasks/a.md" });
const target = makeTask({ id: "b", filePath: "tasks/b.md" });
const tasks: readonly Task[] = [source, target];

/** canonical 完全一致 lookup のテスト用実装。 */
const findTask = (filePath: string): Task | undefined =>
  tasks.find((task) => task.filePath === filePath);

/** raw 参照解決 lookup のテスト用実装（正規化同値で解決する）。 */
const findTaskByReference = (reference: string): Task | undefined =>
  tasks.find((task) => linkReferencesTaskPath(reference, task.filePath));

test("forAdd は source / target とも canonical 完全一致 lookup で引き当てる", () => {
  const intent = LinkIntent.forAdd({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
    findTask,
  });

  expect(intent).toEqual({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
    source,
    target,
  });
});

test("forAdd は raw 表記の targetFilePath を解決しない（canonical 前提のため undefined）", () => {
  const intent = LinkIntent.forAdd({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "./tasks/b.md",
    findTask,
  });

  expect(intent.target).toBeUndefined();
});

test("forRemove は source を canonical・target を参照解決 lookup で引き当てる", () => {
  const intent = LinkIntent.forRemove({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "./tasks/b.md",
    findTask,
    findTaskByReference,
  });

  expect(intent).toEqual({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "./tasks/b.md",
    source,
    target,
  });
});

test("forRemove は解決不能な raw 参照（broken link）で target が undefined になる", () => {
  const intent = LinkIntent.forRemove({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "./tasks/gone.md",
    findTask,
    findTaskByReference,
  });

  expect(intent.source).toBe(source);
  expect(intent.target).toBeUndefined();
});
