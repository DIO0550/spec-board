import { expect, test } from "vitest";
import { TaskForest, type TaskForestPayloadInput } from "@/domains/task-forest";

const forestOf = (payload: TaskForestPayloadInput) =>
  TaskForest.fromPayload(payload);

const threeLevel = (): TaskForestPayloadInput => [
  {
    filePath: "tasks/a.md",
    children: [
      {
        filePath: "tasks/b.md",
        children: [{ filePath: "tasks/c.md", children: [] }],
      },
    ],
  },
];

test("構造等価なら prev をそのまま返す", () => {
  const prev = forestOf(threeLevel());
  const next = forestOf(threeLevel());

  expect(TaskForest.merge(prev, next)).toBe(prev);
});

test("子が 1 件増えたら next を返す", () => {
  const prev = forestOf([{ filePath: "tasks/a.md", children: [] }]);
  const next = forestOf([
    {
      filePath: "tasks/a.md",
      children: [{ filePath: "tasks/b.md", children: [] }],
    },
  ]);

  expect(TaskForest.merge(prev, next)).toBe(next);
});

test("3 段目の children だけが変わっても差分として検出する", () => {
  const prev = forestOf(threeLevel());
  const next = forestOf([
    {
      filePath: "tasks/a.md",
      children: [
        {
          filePath: "tasks/b.md",
          children: [{ filePath: "tasks/changed.md", children: [] }],
        },
      ],
    },
  ]);

  expect(TaskForest.merge(prev, next)).toBe(next);
});

test("空 forest どうしは prev を返す", () => {
  const prev = forestOf([]);
  const next = forestOf([]);

  expect(TaskForest.merge(prev, next)).toBe(prev);
});

test("同一親の兄弟の順序だけが違う場合は等価とみなさない", () => {
  const prev = forestOf([
    {
      filePath: "tasks/a.md",
      children: [
        { filePath: "tasks/b.md", children: [] },
        { filePath: "tasks/c.md", children: [] },
      ],
    },
  ]);
  const next = forestOf([
    {
      filePath: "tasks/a.md",
      children: [
        { filePath: "tasks/c.md", children: [] },
        { filePath: "tasks/b.md", children: [] },
      ],
    },
  ]);

  expect(TaskForest.merge(prev, next)).toBe(next);
});

test("root 列の順序だけが入れ替わった場合も next を返す", () => {
  const prev = forestOf([
    { filePath: "tasks/a.md", children: [] },
    { filePath: "tasks/b.md", children: [] },
  ]);
  const next = forestOf([
    { filePath: "tasks/b.md", children: [] },
    { filePath: "tasks/a.md", children: [] },
  ]);

  const merged = TaskForest.merge(prev, next);

  expect(merged).toBe(next);
  expect(merged.map((node) => node.filePath)).toEqual([
    "tasks/b.md",
    "tasks/a.md",
  ]);
});

test("件数が減った場合は next を返し消えたノードを残さない", () => {
  const prev = forestOf([
    { filePath: "tasks/a.md", children: [] },
    { filePath: "tasks/b.md", children: [] },
  ]);
  const next = forestOf([{ filePath: "tasks/a.md", children: [] }]);

  expect(TaskForest.merge(prev, next)).toBe(next);
});
