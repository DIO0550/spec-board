import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import type { Task } from "@/types/task";

const fp = (id: string) => `tasks/${id}.md`;

test("root が allTasks に無い場合は空配列を返す", () => {
  const b = makeTask({ id: "b" });
  const c = makeTask({ id: "c" });

  const result = TaskHierarchy.collectDescendants([b, c], fp("a"));

  expect(result).toEqual([]);
});

test("子孫 0 件（root のみで childFilePaths 空）は空配列を返す", () => {
  const root = makeTask({ id: "root", children: [] });

  const result = TaskHierarchy.collectDescendants([root], fp("root"));

  expect(result).toEqual([]);
});

test("2 階層（root → 直下子 2 件）で子 2 件を返す", () => {
  const b = makeTask({ id: "b" });
  const c = makeTask({ id: "c" });
  const root = makeTask({
    id: "root",
    children: [fp("b"), fp("c")],
  });

  const result = TaskHierarchy.collectDescendants([root, b, c], fp("root"));

  const ids = result.map((t) => t.id).sort();
  expect(ids).toEqual(["b", "c"]);
});

test("3 階層（root → B → [C, D]）で子孫 3 件を返す", () => {
  const c = makeTask({ id: "c" });
  const d = makeTask({ id: "d" });
  const b = makeTask({ id: "b", children: [fp("c"), fp("d")] });
  const root = makeTask({ id: "root", children: [fp("b")] });

  const result = TaskHierarchy.collectDescendants([root, b, c, d], fp("root"));

  const ids = result.map((t) => t.id).sort();
  expect(ids).toEqual(["b", "c", "d"]);
});

test("サイクル A→B→A でも root を含まず B のみを返す", () => {
  const a = makeTask({ id: "a", children: [fp("b")] });
  const b = makeTask({ id: "b", children: [fp("a")] });

  const result = TaskHierarchy.collectDescendants([a, b], fp("a"));

  expect(result.map((t) => t.id)).toEqual(["b"]);
});

test("自己参照 A→A は無限ループせず空配列を返す", () => {
  const a = makeTask({ id: "a", children: [fp("a")] });

  const result = TaskHierarchy.collectDescendants([a], fp("a"));

  expect(result).toEqual([]);
});

test("childFilePaths に存在しない path があってもスキップして到達可能な子孫のみ返す", () => {
  const b = makeTask({ id: "b" });
  const a = makeTask({
    id: "a",
    children: [fp("missing"), fp("b")],
  });

  const result = TaskHierarchy.collectDescendants([a, b], fp("a"));

  expect(result.map((t) => t.id)).toEqual(["b"]);
});

test("lookup 引数を渡しても渡さなくても同じ結果を返す", () => {
  const c = makeTask({ id: "c" });
  const d = makeTask({ id: "d" });
  const b = makeTask({ id: "b", children: [fp("c"), fp("d")] });
  const root = makeTask({ id: "root", children: [fp("b")] });
  const all: Task[] = [root, b, c, d];

  const lookup = new Map(all.map((t) => [t.filePath, t]));

  const withLookup = TaskHierarchy.collectDescendants(all, fp("root"), {
    lookup,
  });
  const withoutLookup = TaskHierarchy.collectDescendants(all, fp("root"));

  const a = new Set(withLookup.map((t) => t.id));
  const b2 = new Set(withoutLookup.map((t) => t.id));
  expect(a).toEqual(b2);
});

test("diamond（A→B、A→C、B→D、C→D）で D は 1 度だけ含まれる", () => {
  const d = makeTask({ id: "d" });
  const b = makeTask({ id: "b", children: [fp("d")] });
  const c = makeTask({ id: "c", children: [fp("d")] });
  const a = makeTask({ id: "a", children: [fp("b"), fp("c")] });

  const result = TaskHierarchy.collectDescendants([a, b, c, d], fp("a"));

  const ids = result.map((t) => t.id).sort();
  expect(ids).toEqual(["b", "c", "d"]);
  expect(result.length).toBe(3);
});
