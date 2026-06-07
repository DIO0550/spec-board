import { expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { buildTaskTree } from "../index";

const buildTask = (overrides: Partial<TaskPayload>): Task => {
  return Task.fromPayload({
    id: overrides.id ?? "id",
    title: overrides.title ?? "タイトル",
    status: overrides.status ?? "Todo",
    labels: overrides.labels ?? [],
    parent: overrides.parent,
    links: overrides.links ?? [],
    children: overrides.children ?? [],
    reverseLinks: overrides.reverseLinks ?? [],
    body: overrides.body ?? "",
    filePath: overrides.filePath ?? "tasks/a.md",
  });
};

test("親を持たないタスクはすべて深さ 0 のルートになる", () => {
  const tasks = [
    buildTask({ id: "a", filePath: "tasks/a.md" }),
    buildTask({ id: "b", filePath: "tasks/b.md" }),
  ];

  const tree = buildTaskTree(tasks);

  expect(tree.map((node) => node.task.id)).toEqual(["a", "b"]);
  expect(tree.every((node) => node.depth === 0)).toBe(true);
});

test("子タスクは親ノードの下に深さ 1 でぶら下がる", () => {
  const tasks = [
    buildTask({ id: "parent", filePath: "tasks/parent.md" }),
    buildTask({
      id: "child",
      filePath: "tasks/child.md",
      parent: "tasks/parent.md",
    }),
  ];

  const tree = buildTaskTree(tasks);

  expect(tree).toHaveLength(1);
  expect(tree[0].task.id).toBe("parent");
  expect(tree[0].children.map((node) => node.task.id)).toEqual(["child"]);
  expect(tree[0].children[0].depth).toBe(1);
});

test("親が表示集合に無いタスクはルート扱いになる", () => {
  const tasks = [
    buildTask({
      id: "orphan",
      filePath: "tasks/orphan.md",
      parent: "tasks/missing.md",
    }),
  ];

  const tree = buildTaskTree(tasks);

  expect(tree).toHaveLength(1);
  expect(tree[0].task.id).toBe("orphan");
  expect(tree[0].depth).toBe(0);
});

test("親参照の表記揺れ（./ 付き）も正規化して親子を解決する", () => {
  const tasks = [
    buildTask({ id: "parent", filePath: "tasks/parent.md" }),
    buildTask({
      id: "child",
      filePath: "tasks/child.md",
      parent: "./tasks/parent.md",
    }),
  ];

  const tree = buildTaskTree(tasks);

  expect(tree).toHaveLength(1);
  expect(tree[0].children[0].task.id).toBe("child");
});

test("閉じた親循環のタスクもルートとして可視化される（到達不能にしない）", () => {
  const tasks = [
    buildTask({ id: "a", filePath: "tasks/a.md", parent: "tasks/b.md" }),
    buildTask({ id: "b", filePath: "tasks/b.md", parent: "tasks/a.md" }),
  ];

  const tree = buildTaskTree(tasks);

  // 循環成分が空にならず、全タスクがツリーのどこかに 1 回ずつ現れる
  const collectIds = (nodes: ReturnType<typeof buildTaskTree>): string[] =>
    nodes.flatMap((node) => [node.task.id, ...collectIds(node.children)]);
  expect(tree.length).toBeGreaterThan(0);
  expect(collectIds(tree).sort()).toEqual(["a", "b"]);
});
