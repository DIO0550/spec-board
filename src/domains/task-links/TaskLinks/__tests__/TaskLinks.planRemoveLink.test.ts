import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { type RemoveLinkOutcome, TaskLinks } from "@/domains/task-links";

type ApplyPlan = Extract<RemoveLinkOutcome, { kind: "apply" }>;

const asApply = (plan: RemoveLinkOutcome): ApplyPlan => {
  expect(plan.kind).toBe("apply");
  return plan as ApplyPlan;
};

test("forward + target reverse ありで 2 operations の remove と inverse rollback を返す", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target,
  });

  expect(plan).toEqual({
    kind: "apply",
    optimistic: [
      {
        op: "remove",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "tasks/b.md",
      },
      {
        op: "remove",
        filePath: "tasks/b.md",
        field: "reverseLinkedFilePaths",
        value: "tasks/a.md",
      },
    ],
    rollback: [
      {
        op: "append",
        filePath: "tasks/b.md",
        field: "reverseLinkedFilePaths",
        value: "tasks/a.md",
        at: 0,
        requiresValueTask: true,
      },
      {
        op: "append",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "tasks/b.md",
        at: 0,
      },
    ],
  });
});

test("dot-prefix raw の削除で forward は raw 一致・target reverse は canonical で除去する", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["./tasks/b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "./tasks/b.md",
    source,
    target,
  });

  expect(plan).toEqual({
    kind: "apply",
    optimistic: [
      {
        op: "remove",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "./tasks/b.md",
      },
      {
        op: "remove",
        filePath: "tasks/b.md",
        field: "reverseLinkedFilePaths",
        value: "tasks/a.md",
      },
    ],
    rollback: [
      {
        op: "append",
        filePath: "tasks/b.md",
        field: "reverseLinkedFilePaths",
        value: "tasks/a.md",
        at: 0,
        requiresValueTask: true,
      },
      {
        op: "append",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "./tasks/b.md",
        at: 0,
      },
    ],
  });
});

test("正規化同値な併存表記は snapshot index 降順の各 1 operation で除去され rollback は昇順 append になる", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["./tasks/b.md", "tasks/x.md", "tasks\\b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: [],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "./tasks/b.md",
    source,
    target,
  });

  expect(plan).toEqual({
    kind: "apply",
    optimistic: [
      {
        op: "remove",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "tasks\\b.md",
      },
      {
        op: "remove",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "./tasks/b.md",
      },
    ],
    rollback: [
      {
        op: "append",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "./tasks/b.md",
        at: 0,
      },
      {
        op: "append",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "tasks\\b.md",
        at: 2,
      },
    ],
  });
});

test("重複区切りの raw 表記 tasks//b.md も正規化同値で除去対象になる", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks//b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks//b.md",
    source,
    target,
  });

  expect(asApply(plan).optimistic).toEqual([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks//b.md",
    },
    {
      op: "remove",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);
});

test("round-trip: 併存表記の remove → rollback で linkedFilePaths が完全復元される", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["./b", "b\\", "c"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "./b",
    source,
    target: undefined,
  });

  const apply = asApply(plan);
  const removed = TaskLinks.applyLinkOperationsToTask(source, apply.optimistic);
  expect(removed.links.linkedFilePaths).toEqual(["c"]);

  const restored = TaskLinks.applyLinkOperationsToTask(removed, apply.rollback);
  expect(restored.links.linkedFilePaths).toEqual(["./b", "b\\", "c"]);
});

test("round-trip: 完全重複と別表記が混在する remove → rollback で復元順が崩れない", () => {
  // "tasks/b.md" が完全重複（index 0, 2）、"./tasks/b.md" が別表記（index 1）で混在
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "./tasks/b.md", "tasks/b.md", "tasks/c.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target: undefined,
  });

  const apply = asApply(plan);
  const removed = TaskLinks.applyLinkOperationsToTask(source, apply.optimistic);
  expect(removed.links.linkedFilePaths).toEqual(["tasks/c.md"]);

  // 完全重複の復元は 1 件のみ（既知の限界）だが、残る要素の相対順は崩れない
  const restored = TaskLinks.applyLinkOperationsToTask(removed, apply.rollback);
  expect(restored.links.linkedFilePaths).toEqual([
    "tasks/b.md",
    "./tasks/b.md",
    "tasks/c.md",
  ]);
});

test("round-trip: 連続する完全重複の後に別表記が続く remove → rollback でも相対順が崩れない", () => {
  // "tasks/b.md" が連続重複（index 0, 1）、"./tasks/b.md"（index 2）が後続
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "tasks/b.md", "./tasks/b.md", "tasks/c.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target: undefined,
  });

  const apply = asApply(plan);
  const removed = TaskLinks.applyLinkOperationsToTask(source, apply.optimistic);
  expect(removed.links.linkedFilePaths).toEqual(["tasks/c.md"]);

  // "./tasks/b.md" の at は snapshot index 2 でなく、復元されない重複 1 件分を
  // 詰めた実効 index 1 になる（復元は各 value 1 件のみの限界とセットの仕様固定）
  const restored = TaskLinks.applyLinkOperationsToTask(removed, apply.rollback);
  expect(restored.links.linkedFilePaths).toEqual([
    "tasks/b.md",
    "./tasks/b.md",
    "tasks/c.md",
  ]);
});

test("broken link（target 解決不能）でも forward のみで apply し rollback の append に flag が付かない", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["./tasks/gone.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "./tasks/gone.md",
    source,
    target: undefined,
  });

  expect(plan).toEqual({
    kind: "apply",
    optimistic: [
      {
        op: "remove",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "./tasks/gone.md",
      },
    ],
    rollback: [
      {
        op: "append",
        filePath: "tasks/a.md",
        field: "linkedFilePaths",
        value: "./tasks/gone.md",
        at: 0,
      },
    ],
  });
});

test("target の reverse に source が無ければ forward のみを返す", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: [],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target,
  });

  expect(asApply(plan).optimistic).toEqual([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);
});

test("self-link は同一 filePath への forward + reverse の 2 operations を返す", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/a.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/a.md",
    source,
    target: source,
  });

  expect(asApply(plan).optimistic).toEqual([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/a.md",
    },
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);
});

test("raw 表記の self-link も linkReferencesTaskPath で self-link と判定される", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["./tasks/a.md"],
    reverseLinks: ["tasks/a.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "./tasks/a.md",
    source,
    target: source,
  });

  expect(asApply(plan).optimistic).toEqual([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "./tasks/a.md",
    },
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);
});

test("self-link で reverse 不在なら forward のみを返す", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/a.md"],
    reverseLinks: [],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/a.md",
    source,
    target: source,
  });

  expect(asApply(plan).optimistic).toEqual([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/a.md",
    },
  ]);
});

test("forward 不在（正規化同値でマッチする raw なし）は noop を返し stale reverse は触らない", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/x.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target,
  });

  expect(plan).toEqual({ kind: "noop", task: source });
  expect(plan.kind === "noop" && plan.task === source).toBe(true);
});

test("同一文字列の完全重複エントリは 1 operation で一括削除され復元は 1 件のみ", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "tasks/x.md", "tasks/b.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: [],
  });

  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target,
  });

  expect(asApply(plan).optimistic).toEqual([
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);
  expect(asApply(plan).rollback).toEqual([
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
      at: 0,
    },
  ]);
});

test("source 不在は rejected（reason: source-not-found）を返す", () => {
  const plan = TaskLinks.planRemoveLink({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
    source: undefined,
    target: undefined,
  });

  expect(plan).toEqual({ kind: "rejected", reason: "source-not-found" });
});

test("plan 呼出は入力 Task の links 配列を破壊しない", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md", "tasks/c.md"],
  });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });

  TaskLinks.planRemoveLink({
    sourceFilePath: source.filePath,
    targetFilePath: "tasks/b.md",
    source,
    target,
  });

  expect(source.links.linkedFilePaths).toEqual(["tasks/b.md", "tasks/c.md"]);
  expect(target.links.reverseLinkedFilePaths).toEqual(["tasks/a.md"]);
});
