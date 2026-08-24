import { expect, expectTypeOf, test } from "vitest";
import { TaskForest, type TaskForestPayloadInput } from "@/domains/task-forest";
import type { TaskFilePath } from "@/domains/task-identity";

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

test("raw payloadを再利用せず各nodeのfilePathをdomain型へ変換する", () => {
  const forest = TaskForest.fromPayload(payload);

  expect(forest).not.toBe(payload);
  expect(forest[0]).not.toBe(payload[0]);
  expect(forest[0].children[0]).not.toBe(payload[0].children[0]);
  expectTypeOf(forest[0].filePath).toEqualTypeOf<TaskFilePath>();
});

test("空 payload は空 forest になる", () => {
  expect(TaskForest.fromPayload([])).toEqual([]);
});

test("TaskForest.empty は毎回同じ参照を返す", () => {
  expect(TaskForest.empty).toBe(TaskForest.empty);
});
