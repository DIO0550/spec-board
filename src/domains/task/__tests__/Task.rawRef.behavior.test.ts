import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { Task } from "..";

test("rawParentRef は元値 (undefined) を保持", () => {
  const task = makeTask({ id: "t" });
  expect(Task.rawParentRef(task)).toBeUndefined();
});

test("rawParentRef と canonicalParentRef は正規化済みなら一致", () => {
  const task = makeTask({ id: "t", parent: "tasks/parent.md" });
  expect(Task.rawParentRef(task)).toBe("tasks/parent.md");
  expect(Task.canonicalParentRef(task)).toBe("tasks/parent.md");
});

test("canonicalParentRef は 相対 (./) を正規化する", () => {
  const task = makeTask({ id: "t", parent: "./tasks/parent.md" });
  expect(Task.rawParentRef(task)).toBe("./tasks/parent.md");
  expect(Task.canonicalParentRef(task)).toBe("tasks/parent.md");
});

test("canonicalParentRef は 空文字を undefined 化", () => {
  const task = makeTask({ id: "t", parent: "" });
  expect(Task.rawParentRef(task)).toBe("");
  expect(Task.canonicalParentRef(task)).toBeUndefined();
});

test("canonicalParentRef は 絶対 path を undefined 化", () => {
  const task = makeTask({ id: "t", parent: "/abs/parent.md" });
  expect(Task.canonicalParentRef(task)).toBeUndefined();
});

test("canonicalParentRef は Windows drive prefix を undefined 化", () => {
  const task = makeTask({ id: "t", parent: "C:\\tasks\\parent.md" });
  expect(Task.canonicalParentRef(task)).toBeUndefined();
});

test("rawChildRefs は元配列を保持し canonicalChildRefs は invalid を除外", () => {
  const task = makeTask({
    id: "t",
    children: ["", "tasks/a.md", "/abs/b.md", "./tasks/c.md"],
  });
  expect(Task.rawChildRefs(task)).toEqual([
    "",
    "tasks/a.md",
    "/abs/b.md",
    "./tasks/c.md",
  ]);
  expect(Task.canonicalChildRefs(task)).toEqual(["tasks/a.md", "tasks/c.md"]);
});

test("canonicalLinkedRefs は Windows drive prefix と 空文字を除外", () => {
  const task = makeTask({
    id: "t",
    links: ["C:\\a.md", "tasks/a.md", ""],
  });
  expect(Task.rawLinkedRefs(task)).toEqual(["C:\\a.md", "tasks/a.md", ""]);
  expect(Task.canonicalLinkedRefs(task)).toEqual(["tasks/a.md"]);
});

test("rawReverseLinkedRefs と canonicalReverseLinkedRefs も同じルール", () => {
  const task = makeTask({
    id: "t",
    reverseLinks: ["tasks/x.md", ""],
  });
  expect(Task.rawReverseLinkedRefs(task)).toEqual(["tasks/x.md", ""]);
  expect(Task.canonicalReverseLinkedRefs(task)).toEqual(["tasks/x.md"]);
});

test("配列 refs は 全て正規化不可 で空配列を返す（undefined を混入しない）", () => {
  const task = makeTask({
    id: "t",
    children: ["", "/abs/a.md", "C:\\b.md"],
  });
  expect(Task.canonicalChildRefs(task)).toEqual([]);
});
