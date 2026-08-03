import { expect, test } from "vitest";
import { TaskForest, type TaskForestPayloadInput } from "@/domains/task-forest";

/**
 * 参照同一性（`fromPayload(p) === p`）は固定しない。素通しは「作っては捨てる割り当てを
 * 避ける」実装上の選択であって外部契約ではなく、固定すると将来 payload 形状が domain と
 * 乖離して変換が必要になったときに正しい変更がテストで阻まれる。
 */
const payload: TaskForestPayloadInput = [
  {
    filePath: "tasks/a.md",
    children: [
      {
        filePath: "tasks/b.md",
        children: [{ filePath: "tasks/c.md", children: [] }],
      },
    ],
  },
  { filePath: "tasks/d.md", children: [] },
];

test("単層の root 列は filePath と順序がそのまま保たれる", () => {
  const forest = TaskForest.fromPayload([
    { filePath: "tasks/z.md", children: [] },
    { filePath: "tasks/a.md", children: [] },
  ]);

  expect(forest.map((node) => node.filePath)).toEqual([
    "tasks/z.md",
    "tasks/a.md",
  ]);
});

test("ネストした children の構造と各段の順序が保たれる", () => {
  const forest = TaskForest.fromPayload(payload);

  expect(forest.map((node) => node.filePath)).toEqual([
    "tasks/a.md",
    "tasks/d.md",
  ]);
  expect(forest[0].children.map((node) => node.filePath)).toEqual([
    "tasks/b.md",
  ]);
  expect(forest[0].children[0].children.map((node) => node.filePath)).toEqual([
    "tasks/c.md",
  ]);
});

test("空 payload は空 forest になる", () => {
  expect(TaskForest.fromPayload([])).toEqual([]);
});

test("TaskForest.empty は毎回同じ参照を返す", () => {
  expect(TaskForest.empty).toBe(TaskForest.empty);
});
