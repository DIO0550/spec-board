import { expect, test } from "vitest";
import { Task } from "@/types/task";
import { buildFileTree, type FileTreeNode } from "..";

const buildTask = (filePath: string, id: string): Task => {
  return Task.fromPayload({
    id,
    title: id,
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath,
  });
};

test("ルート直下のファイルは file ノードになる", () => {
  const tree = buildFileTree([buildTask("a.md", "a")]);
  expect(tree).toHaveLength(1);
  expect(tree[0]).toMatchObject({ kind: "file", name: "a.md" });
});

test("ネストした filePath はディレクトリ階層に展開される", () => {
  const tree = buildFileTree([buildTask("tasks/a.md", "a")]);
  expect(tree[0]).toMatchObject({ kind: "dir", name: "tasks", path: "tasks" });
  const dir = tree[0] as Extract<FileTreeNode, { kind: "dir" }>;
  expect(dir.children[0]).toMatchObject({ kind: "file", name: "a.md" });
});

test("同じディレクトリ配下のファイルは 1 つの dir にまとまる", () => {
  const tree = buildFileTree([
    buildTask("tasks/a.md", "a"),
    buildTask("tasks/b.md", "b"),
  ]);
  expect(tree).toHaveLength(1);
  const dir = tree[0] as Extract<FileTreeNode, { kind: "dir" }>;
  expect(dir.children.map((node) => node.name)).toEqual(["a.md", "b.md"]);
});

test("各階層はディレクトリを先に、ファイルを後に名前昇順で並べる", () => {
  const tree = buildFileTree([
    buildTask("z.md", "z"),
    buildTask("sub/c.md", "c"),
  ]);
  expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual([
    "dir:sub",
    "file:z.md",
  ]);
});

test("バックスラッシュ区切りの filePath も正規化して扱う", () => {
  const tree = buildFileTree([buildTask("tasks\\nested\\a.md", "a")]);
  const dir = tree[0] as Extract<FileTreeNode, { kind: "dir" }>;
  expect(dir.name).toBe("tasks");
  const nested = dir.children[0] as Extract<FileTreeNode, { kind: "dir" }>;
  expect(nested.name).toBe("nested");
  expect(nested.children[0]).toMatchObject({ kind: "file", name: "a.md" });
});
