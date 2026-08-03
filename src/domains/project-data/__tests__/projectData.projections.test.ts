import { expect, test } from "vitest";
import {
  MilestoneProjection,
  type MilestoneProjectionMap,
} from "@/domains/milestone-projection";
import { TaskForest } from "@/domains/task-forest";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import type { Column } from "@/types/column";
import { Task } from "@/types/task";
import { ProjectData, type ProjectData as ProjectDataT } from "..";

const makeTask = (filePath: string): ReturnType<typeof Task.fromPayload> =>
  Task.fromPayload({
    id: filePath,
    filePath,
    title: "T",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    extras: {},
    warnings: [],
  });

const columns: Column[] = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

const projectionOf = (done: number, total: number): TaskProjection => ({
  subIssueProgress: { done, total },
  isDone: false,
  childFilePaths: ["tasks/c.md"],
});

const milestoneProjectionOf = (
  done: number,
  total: number,
  taskFilePaths: readonly string[] = ["tasks/a.md"],
) => ({ done, total, taskFilePaths });

const dataWith = (
  projections: TaskProjectionMap,
  milestoneProjections: MilestoneProjectionMap = MilestoneProjection.emptyMap,
  taskTree: TaskForest = TaskForest.empty,
): ProjectDataT => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [makeTask("tasks/a.md")],
  columns,
  doneColumn: "Done",
  projections,
  milestoneProjections,
  taskTree,
  openRequestId: 1,
  loadWarnings: [],
});

const replaceTaskProjections = (
  data: ProjectDataT,
  projections: TaskProjectionMap,
): ProjectDataT =>
  ProjectData.replaceProjections(data, {
    projections,
    milestoneProjections: data.milestoneProjections,
    taskTree: [],
  });

test("replaceProjections は projections だけを差し替える", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = replaceTaskProjections(
    data,
    new Map([["tasks/a.md", projectionOf(1, 2)]]),
  );

  expect(next.projections.get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 1,
    total: 2,
  });
});

test("replaceProjections は tasks / columns / doneColumn / openRequestId を変えない", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = replaceTaskProjections(
    data,
    new Map([["tasks/a.md", projectionOf(1, 2)]]),
  );

  expect(next.tasks).toBe(data.tasks);
  expect(next.columns).toBe(data.columns);
  expect(next.doneColumn).toBe("Done");
  expect(next.openRequestId).toBe(1);
});

test("replaceProjections は空 Map への差し替えができる", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = replaceTaskProjections(data, new Map());

  expect(next.projections.size).toBe(0);
});

test("値が等価なエントリは旧オブジェクトの参照を引き継ぐ", () => {
  const kept = projectionOf(0, 2);
  const data = dataWith(
    new Map([
      ["tasks/a.md", kept],
      ["tasks/b.md", projectionOf(0, 1)],
    ]),
  );

  const next = replaceTaskProjections(
    data,
    new Map([
      ["tasks/a.md", projectionOf(0, 2)],
      ["tasks/b.md", projectionOf(1, 1)],
    ]),
  );

  expect(next.projections.get("tasks/a.md")).toBe(kept);
});

test("値が変わったエントリは新しいオブジェクトになる", () => {
  const changed = projectionOf(0, 1);
  const data = dataWith(new Map([["tasks/b.md", changed]]));

  const next = replaceTaskProjections(
    data,
    new Map([["tasks/b.md", projectionOf(1, 1)]]),
  );

  expect(next.projections.get("tasks/b.md")).not.toBe(changed);
  expect(next.projections.get("tasks/b.md")?.subIssueProgress.done).toBe(1);
});

test("全エントリが等価なら Map インスタンスごと据え置く", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = replaceTaskProjections(
    data,
    new Map([["tasks/a.md", projectionOf(0, 2)]]),
  );

  expect(next.projections).toBe(data.projections);
});

test("全エントリが等価なら ProjectData オブジェクトごと据え置く", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = replaceTaskProjections(
    data,
    new Map([["tasks/a.md", projectionOf(0, 2)]]),
  );

  expect(next).toBe(data);
});

test("1 エントリだけ変われば Map も ProjectData も新インスタンスになる", () => {
  const kept = projectionOf(0, 2);
  const data = dataWith(
    new Map([
      ["tasks/a.md", kept],
      ["tasks/b.md", projectionOf(0, 1)],
    ]),
  );

  const next = replaceTaskProjections(
    data,
    new Map([
      ["tasks/a.md", projectionOf(0, 2)],
      ["tasks/b.md", projectionOf(1, 1)],
    ]),
  );

  expect(next).not.toBe(data);
  expect(next.projections).not.toBe(data.projections);
  expect(next.projections.get("tasks/a.md")).toBe(kept);
});

test("エントリ数が減れば残存エントリが等価でも Map 参照が変わる", () => {
  const kept = projectionOf(0, 2);
  const data = dataWith(
    new Map([
      ["tasks/a.md", kept],
      ["tasks/b.md", projectionOf(0, 1)],
    ]),
  );

  const next = replaceTaskProjections(
    data,
    new Map([["tasks/a.md", projectionOf(0, 2)]]),
  );

  expect(next.projections).not.toBe(data.projections);
  expect(next.projections.size).toBe(1);
});

test("未登録 filePath の projection は findByFilePath が empty を返す", () => {
  const data = dataWith(TaskProjection.emptyMap);

  expect(TaskProjection.findByFilePath(data.projections, "tasks/a.md")).toBe(
    TaskProjection.empty,
  );
});

test("replaceProjections は task と milestone の両 Map を1回で更新する", () => {
  const data = dataWith(
    new Map([["tasks/a.md", projectionOf(0, 1)]]),
    new Map([["v1", milestoneProjectionOf(0, 1)]]),
  );

  const next = ProjectData.replaceProjections(data, {
    projections: new Map([["tasks/a.md", projectionOf(1, 1)]]),
    milestoneProjections: new Map([["v1", milestoneProjectionOf(1, 1)]]),
    taskTree: [],
  });

  expect(next.projections.get("tasks/a.md")?.subIssueProgress.done).toBe(1);
  expect(next.milestoneProjections.get("v1")?.done).toBe(1);
});

test("task projection だけ変わると milestone Map の参照を保つ", () => {
  const milestoneProjections = new Map([["v1", milestoneProjectionOf(0, 1)]]);
  const data = dataWith(
    new Map([["tasks/a.md", projectionOf(0, 1)]]),
    milestoneProjections,
  );

  const next = ProjectData.replaceProjections(data, {
    projections: new Map([["tasks/a.md", projectionOf(1, 1)]]),
    milestoneProjections: new Map([["v1", milestoneProjectionOf(0, 1)]]),
    taskTree: [],
  });

  expect(next.milestoneProjections).toBe(milestoneProjections);
  expect(next.projections).not.toBe(data.projections);
});

test("milestone projection だけ変わると task Map の参照を保つ", () => {
  const projections = new Map([["tasks/a.md", projectionOf(0, 1)]]);
  const data = dataWith(
    projections,
    new Map([["v1", milestoneProjectionOf(0, 1)]]),
  );

  const next = ProjectData.replaceProjections(data, {
    projections: new Map([["tasks/a.md", projectionOf(0, 1)]]),
    milestoneProjections: new Map([["v1", milestoneProjectionOf(1, 1)]]),
    taskTree: [],
  });

  expect(next.projections).toBe(projections);
  expect(next.milestoneProjections).not.toBe(data.milestoneProjections);
});

test("milestone task path の順序が変わると新しい entry と Map を採用する", () => {
  const previous = milestoneProjectionOf(0, 2, ["tasks/a.md", "tasks/b.md"]);
  const data = dataWith(new Map(), new Map([["v1", previous]]));

  const next = ProjectData.replaceProjections(data, {
    projections: new Map(),
    milestoneProjections: new Map([
      ["v1", milestoneProjectionOf(0, 2, ["tasks/b.md", "tasks/a.md"])],
    ]),
    taskTree: [],
  });

  expect(next.milestoneProjections).not.toBe(data.milestoneProjections);
  expect(next.milestoneProjections.get("v1")).not.toBe(previous);
});

test("両 Map が完全等価なら entry・Map・ProjectData の全参照を保つ", () => {
  const taskProjection = projectionOf(0, 1);
  const milestoneProjection = milestoneProjectionOf(0, 1);
  const data = dataWith(
    new Map([["tasks/a.md", taskProjection]]),
    new Map([["v1", milestoneProjection]]),
  );

  const next = ProjectData.replaceProjections(data, {
    projections: new Map([["tasks/a.md", projectionOf(0, 1)]]),
    milestoneProjections: new Map([["v1", milestoneProjectionOf(0, 1)]]),
    taskTree: [],
  });

  expect(next).toBe(data);
  expect(next.projections.get("tasks/a.md")).toBe(taskProjection);
  expect(next.milestoneProjections.get("v1")).toBe(milestoneProjection);
});

test("milestone entry の削除と空 Map を反映する", () => {
  const data = dataWith(
    new Map(),
    new Map([["v1", milestoneProjectionOf(0, 1)]]),
  );

  const next = ProjectData.replaceProjections(data, {
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
  });

  expect(next.milestoneProjections.size).toBe(0);
  expect(next.milestoneProjections).not.toBe(data.milestoneProjections);
});

// ───────── taskTree の参照保存 ─────────

const treeOf = (...filePaths: string[]): TaskForest =>
  TaskForest.fromPayload(
    filePaths.map((filePath) => ({ filePath, children: [] })),
  );

test("projections も tree も等価なら ProjectData 参照を据え置く", () => {
  const data = dataWith(
    new Map(),
    MilestoneProjection.emptyMap,
    treeOf("tasks/a.md"),
  );

  const next = ProjectData.replaceProjections(data, {
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: treeOf("tasks/a.md"),
  });

  expect(next).toBe(data);
  expect(next.taskTree).toBe(data.taskTree);
});

test("tree だけ変わった場合も新しい ProjectData に反映される", () => {
  const data = dataWith(
    new Map(),
    MilestoneProjection.emptyMap,
    treeOf("tasks/a.md"),
  );
  const taskTree = TaskForest.fromPayload([
    {
      filePath: "tasks/a.md",
      children: [{ filePath: "tasks/b.md", children: [] }],
    },
  ]);

  const next = ProjectData.replaceProjections(data, {
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree,
  });

  expect(next).not.toBe(data);
  expect(next.taskTree).toBe(taskTree);
});

test("optimistic な task 追加では taskTree が据え置かれる", () => {
  const data = dataWith(
    new Map(),
    MilestoneProjection.emptyMap,
    treeOf("tasks/a.md"),
  );

  const next = ProjectData.applyTaskCreated(data, makeTask("tasks/new.md"));

  expect(next.taskTree).toBe(data.taskTree);
  expect(next.tasks).toHaveLength(2);
});

test("optimistic な task 削除でも taskTree が据え置かれる", () => {
  const data = dataWith(
    new Map(),
    MilestoneProjection.emptyMap,
    treeOf("tasks/a.md"),
  );

  const next = ProjectData.applyTaskDeleted(data, "tasks/a.md");

  expect(next.taskTree).toBe(data.taskTree);
  expect(next.tasks).toHaveLength(0);
});

test("optimistic な親付け替えでは次の get_tasks まで旧階層のまま", () => {
  const data = dataWith(
    new Map(),
    MilestoneProjection.emptyMap,
    treeOf("tasks/a.md"),
  );
  const reparented = Task.fromPayload({
    id: "tasks/a.md",
    filePath: "tasks/a.md",
    title: "T",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    extras: {},
    warnings: [],
    parent: "tasks/parent.md",
  });

  const next = ProjectData.applyTaskUpdated(data, "tasks/a.md", reparented);

  expect(next.taskTree).toBe(data.taskTree);
});
