import { expect, test } from "vitest";
import {
  TaskForest,
  type TaskForestPayloadInput,
  type TaskTreeNode,
} from "@/domains/task-forest";

const node = (
  filePath: string,
  children: TaskForestPayloadInput = [],
): TaskForestPayloadInput[number] => ({ filePath, children });

const forestOf = (payload: TaskForestPayloadInput) =>
  TaskForest.fromPayload(payload);

/** 親 a の下に b、b の下に c という 3 段の正準ツリー。 */
const threeLevel = () =>
  forestOf([node("tasks/a.md", [node("tasks/b.md", [node("tasks/c.md")])])]);

const rootPaths = (forest: TaskForest): string[] =>
  forest.map((current) => current.filePath);

const childPaths = (current: TaskTreeNode): string[] =>
  current.children.map((child) => child.filePath);

/**
 * preorder（root → 子 → 孫）で出現順に filePath を並べる。
 *
 * 10,000 段の forest も渡すため反復で書く。`pop()` ではなく末尾要素を読んでから
 * 縮めるのは、`undefined` 判定の分岐をテストコードへ持ち込まないため。
 */
const preorderPaths = (forest: TaskForest): string[] => {
  const result: string[] = [];
  const stack: TaskTreeNode[] = [...forest].reverse();
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    stack.pop();
    result.push(current.filePath);
    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      stack.push(current.children[index]);
    }
  }
  return result;
};

test("全件可視なら構造がそのまま残る", () => {
  const forest = threeLevel();

  const pruned = TaskForest.prune(forest, [
    "tasks/a.md",
    "tasks/b.md",
    "tasks/c.md",
  ]);

  expect(preorderPaths(pruned)).toEqual([
    "tasks/a.md",
    "tasks/b.md",
    "tasks/c.md",
  ]);
});

test("不可視ノードはツリーから消える", () => {
  const forest = forestOf([
    node("tasks/a.md", [node("tasks/b.md"), node("tasks/c.md")]),
  ]);

  const pruned = TaskForest.prune(forest, ["tasks/a.md", "tasks/c.md"]);

  expect(rootPaths(pruned)).toEqual(["tasks/a.md"]);
  expect(childPaths(pruned[0])).toEqual(["tasks/c.md"]);
});

test("親が不可視の子は root へ昇格する", () => {
  const forest = forestOf([node("tasks/a.md", [node("tasks/b.md")])]);

  const pruned = TaskForest.prune(forest, ["tasks/b.md"]);

  expect(rootPaths(pruned)).toEqual(["tasks/b.md"]);
});

test("root 列は可視タスクの board 順に並ぶ", () => {
  const forest = forestOf([
    node("tasks/parent.md", [node("tasks/child.md")]),
    node("tasks/other.md"),
  ]);

  const pruned = TaskForest.prune(forest, ["tasks/other.md", "tasks/child.md"]);

  expect(rootPaths(pruned)).toEqual(["tasks/other.md", "tasks/child.md"]);
});

test("children も visibleFilePaths の順に並ぶ", () => {
  const forest = forestOf([
    node("tasks/a.md", [
      node("tasks/b.md"),
      node("tasks/c.md"),
      node("tasks/d.md"),
    ]),
  ]);

  const pruned = TaskForest.prune(forest, [
    "tasks/a.md",
    "tasks/d.md",
    "tasks/b.md",
  ]);

  expect(childPaths(pruned[0])).toEqual(["tasks/d.md", "tasks/b.md"]);
});

test("stale tree の children 順より visibleFilePaths の順が優先される", () => {
  const forest = forestOf([
    node("tasks/a.md", [node("tasks/b.md"), node("tasks/c.md")]),
  ]);

  const pruned = TaskForest.prune(forest, [
    "tasks/a.md",
    "tasks/c.md",
    "tasks/b.md",
  ]);

  expect(childPaths(pruned[0])).toEqual(["tasks/c.md", "tasks/b.md"]);
});

test("可視集合が空なら空 forest を返す", () => {
  expect(TaskForest.prune(threeLevel(), [])).toEqual([]);
});

test("forest が空でも可視タスクは root として現れる", () => {
  const pruned = TaskForest.prune(TaskForest.empty, [
    "tasks/a.md",
    "tasks/b.md",
  ]);

  expect(rootPaths(pruned)).toEqual(["tasks/a.md", "tasks/b.md"]);
});

test("tree に無い可視タスク（作成直後の stale tree）も root として現れる", () => {
  const forest = forestOf([node("tasks/a.md")]);

  const pruned = TaskForest.prune(forest, ["tasks/a.md", "tasks/new.md"]);

  expect(rootPaths(pruned)).toEqual(["tasks/a.md", "tasks/new.md"]);
});

test("親が可視で祖父が不可視なら孫は最近祖先へ再接続せず root へ昇格する", () => {
  const forest = threeLevel();

  const pruned = TaskForest.prune(forest, ["tasks/a.md", "tasks/c.md"]);

  expect(rootPaths(pruned)).toEqual(["tasks/a.md", "tasks/c.md"]);
  expect(childPaths(pruned[0])).toEqual([]);
});

test("可視列で子が親より前に来ても親子関係が保たれる", () => {
  const forest = forestOf([node("tasks/parent.md", [node("tasks/child.md")])]);

  const pruned = TaskForest.prune(forest, [
    "tasks/child.md",
    "tasks/parent.md",
  ]);

  expect(rootPaths(pruned)).toEqual(["tasks/parent.md"]);
  expect(childPaths(pruned[0])).toEqual(["tasks/child.md"]);
});

test("循環由来の forest を全件可視で枝刈りしても全タスクが 1 回ずつ現れる", () => {
  // `project_forest` が閉路メンバ a / b を救済 root として出し、x は a 配下に残した形。
  const forest = forestOf([
    node("tasks/a.md", [node("tasks/x.md")]),
    node("tasks/b.md"),
  ]);

  const pruned = TaskForest.prune(forest, [
    "tasks/a.md",
    "tasks/b.md",
    "tasks/x.md",
  ]);

  expect(preorderPaths(pruned).sort()).toEqual([
    "tasks/a.md",
    "tasks/b.md",
    "tasks/x.md",
  ]);
});

test("循環由来の forest を部分可視で枝刈りしても残りが 1 回ずつ現れる", () => {
  const forest = forestOf([
    node("tasks/a.md", [node("tasks/x.md")]),
    node("tasks/b.md"),
  ]);

  const pruned = TaskForest.prune(forest, ["tasks/a.md", "tasks/x.md"]);

  expect(preorderPaths(pruned)).toEqual(["tasks/a.md", "tasks/x.md"]);
});

test("visibleFilePaths に重複があっても出力には 1 回だけ現れる", () => {
  const forest = forestOf([node("tasks/a.md")]);

  const pruned = TaskForest.prune(forest, [
    "tasks/a.md",
    "tasks/a.md",
    "tasks/b.md",
  ]);

  expect(preorderPaths(pruned)).toEqual(["tasks/a.md", "tasks/b.md"]);
});

test("出力ノード集合は可視集合と過不足なく一致する", () => {
  const forest = forestOf([
    node("tasks/a.md", [node("tasks/x.md")]),
    node("tasks/b.md"),
    node("tasks/orphan.md"),
  ]);
  const visible = ["tasks/a.md", "tasks/b.md", "tasks/x.md", "tasks/orphan.md"];

  const pruned = TaskForest.prune(forest, visible);

  expect(preorderPaths(pruned).sort()).toEqual([...visible].sort());
});

test("親が相互参照になった壊れた forest でもノードが消えず出力が有限の森になる", () => {
  // BE では作られない payload。parent map が a→b / b→a の相互参照になる。
  const forest = forestOf([
    node("tasks/a.md", [node("tasks/b.md")]),
    node("tasks/b.md", [node("tasks/a.md")]),
  ]);

  const pruned = TaskForest.prune(forest, ["tasks/a.md", "tasks/b.md"]);

  expect(preorderPaths(pruned).sort()).toEqual(["tasks/a.md", "tasks/b.md"]);
});

test("10,000 段の 1 本鎖でも prune と equals が RangeError を投げない", () => {
  const depth = 10_000;
  let chain: TaskForestPayloadInput = [];
  for (let index = depth - 1; index >= 0; index -= 1) {
    chain = [node(`tasks/node-${index}.md`, chain)];
  }
  const forest = forestOf(chain);
  const visible = Array.from(
    { length: depth },
    (_unused, index) => `tasks/node-${index}.md`,
  );

  const pruned = TaskForest.prune(forest, visible);

  expect(preorderPaths(pruned)).toHaveLength(depth);
  expect(TaskForest.equals(pruned, forest)).toBe(true);
});
