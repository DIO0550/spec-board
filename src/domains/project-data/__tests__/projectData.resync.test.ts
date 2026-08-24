import { expect, test } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import {
  MilestoneProjection,
  type MilestoneProjectionMap,
} from "@/domains/milestone-projection";
import { ProjectData } from "@/domains/project-data";
import type { ProjectLoadWarning } from "@/domains/project-load-warning";
import { TaskForest } from "@/domains/task-forest";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import { WatcherSession } from "@/domains/watcher-session";
import { Task, type TaskPayload } from "@/types/task";

const payload = (overrides: Partial<TaskPayload> = {}): TaskPayload => ({
  id: taskFilePathFixture("tasks/a.md"),
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/a.md"),
  extras: {},
  warnings: [],
  ...overrides,
});

const projectionOf = (filePath: string, done: boolean): TaskProjectionMap =>
  TaskProjection.fromPayload({
    [filePath]: {
      subIssueProgress: { done: 0, total: 0 },
      isDone: done,
      childFilePaths: [],
    },
  });

const milestoneProjectionOf = (
  done: number,
  total: number,
  taskFilePaths: readonly ReturnType<typeof taskFilePathFixture>[] = [
    taskFilePathFixture("tasks/a.md"),
  ],
): MilestoneProjectionMap => new Map([["v1", { done, total, taskFilePaths }]]);

const session = WatcherSession.fromPayload({
  projectKey: "/home/user/specs",
  generation: 3,
  revision: 42,
  eventSeq: 17,
});

const baseData = (
  tasks: Task[],
  projections: TaskProjectionMap,
  milestoneProjections: MilestoneProjectionMap = MilestoneProjection.emptyMap,
  taskTree: TaskForest = TaskForest.empty,
): ProjectData => ({
  tasks,
  columns: [{ name: "Todo", order: 0 }],
  doneColumn: "Done",
  projections,
  milestoneProjections,
  taskTree,
  openRequestId: 7,
  loadWarnings: [],
  watcherSession: session,
});

const resyncTaskSnapshot = (
  data: ProjectData,
  snapshot: { tasks: Task[]; projections: TaskProjectionMap },
): ProjectData =>
  ProjectData.resyncTasks(data, {
    ...snapshot,
    milestoneProjections: data.milestoneProjections,
    taskTree: [],
  });

test("内容が変わった task が反映され、他フィールドは据え置かれる", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
  );

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
  });

  expect(next.tasks[0].title).toBe("A2");
  expect(next.columns).toBe(data.columns);
  expect(next.doneColumn).toBe(data.doneColumn);
  expect(next.openRequestId).toBe(data.openRequestId);
  expect(next.watcherSession).toBe(data.watcherSession);
});

test("内容が同一なら ProjectData の参照がそのまま保たれる", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
  );

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
  });

  expect(next).toBe(data);
});

test("3 件中 1 件だけ変わったとき、変わっていない 2 件は旧参照のまま", () => {
  const kept = [
    Task.fromPayload(
      payload({
        filePath: taskFilePathFixture("tasks/a.md"),
        id: taskFilePathFixture("tasks/a.md"),
      }),
    ),
    Task.fromPayload(
      payload({
        filePath: taskFilePathFixture("tasks/b.md"),
        id: taskFilePathFixture("tasks/b.md"),
      }),
    ),
  ];
  const changed = Task.fromPayload(
    payload({
      filePath: taskFilePathFixture("tasks/c.md"),
      id: taskFilePathFixture("tasks/c.md"),
    }),
  );
  const data = baseData([...kept, changed], new Map());

  const next = resyncTaskSnapshot(data, {
    tasks: [
      Task.fromPayload(
        payload({
          filePath: taskFilePathFixture("tasks/a.md"),
          id: taskFilePathFixture("tasks/a.md"),
        }),
      ),
      Task.fromPayload(
        payload({
          filePath: taskFilePathFixture("tasks/b.md"),
          id: taskFilePathFixture("tasks/b.md"),
        }),
      ),
      Task.fromPayload(
        payload({
          filePath: taskFilePathFixture("tasks/c.md"),
          id: taskFilePathFixture("tasks/c.md"),
          title: "C2",
        }),
      ),
    ],
    projections: new Map(),
  });

  expect(next.tasks[0]).toBe(kept[0]);
  expect(next.tasks[1]).toBe(kept[1]);
  expect(next.tasks[2]).not.toBe(changed);
});

test("tasks だけ変わったときも projections の参照は保たれる", () => {
  const projections = projectionOf(taskFilePathFixture("tasks/a.md"), false);
  const data = baseData([Task.fromPayload(payload())], projections);

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
  });

  expect(next.projections).toBe(projections);
  expect(next.tasks).not.toBe(data.tasks);
});

test("projections だけ変わったときも tasks の参照は保たれる", () => {
  const tasks = [Task.fromPayload(payload())];
  const data = baseData(
    tasks,
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
  );

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), true),
  });

  expect(next.tasks).toBe(tasks);
  expect(next.projections).not.toBe(data.projections);
});

test("空 snapshot は tasks を空配列にする", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
  );

  const next = resyncTaskSnapshot(data, {
    tasks: [],
    projections: new Map(),
  });

  expect(next.tasks).toHaveLength(0);
});

test("件数が増えた snapshot を取りこぼさない", () => {
  const data = baseData([Task.fromPayload(payload())], new Map());

  const next = resyncTaskSnapshot(data, {
    tasks: [
      Task.fromPayload(payload()),
      Task.fromPayload(
        payload({
          filePath: taskFilePathFixture("tasks/b.md"),
          id: taskFilePathFixture("tasks/b.md"),
        }),
      ),
    ],
    projections: new Map(),
  });

  expect(next.tasks).toHaveLength(2);
});

test("楽観 dispatch した Task と等価な snapshot ではその Task の参照が保たれる", () => {
  const optimistic = Task.fromPayload(payload({ status: "Doing" }));
  const data = baseData([optimistic], new Map());

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload({ status: "Doing" }))],
    projections: new Map(),
  });

  expect(next.tasks[0]).toBe(optimistic);
});

test("resyncTasks は tasks と両 projection を同じ snapshot から更新する", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
    milestoneProjectionOf(0, 1),
  );

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), true),
    milestoneProjections: milestoneProjectionOf(1, 1),
    taskTree: [],
  });

  expect(next.tasks[0].title).toBe("A2");
  expect(next.projections.get(taskFilePathFixture("tasks/a.md"))?.isDone).toBe(
    true,
  );
  expect(next.milestoneProjections.get("v1")?.done).toBe(1);
});

test("milestone projection だけ変わると tasks と task Map の参照を保つ", () => {
  const tasks = [Task.fromPayload(payload())];
  const projections = projectionOf(taskFilePathFixture("tasks/a.md"), false);
  const data = baseData(tasks, projections, milestoneProjectionOf(0, 1));

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
    milestoneProjections: milestoneProjectionOf(1, 1),
    taskTree: [],
  });

  expect(next.tasks).toBe(tasks);
  expect(next.projections).toBe(projections);
  expect(next.milestoneProjections).not.toBe(data.milestoneProjections);
});

test("tasks と両 Map が等価なら resyncTasks は ProjectData 参照を保つ", () => {
  const milestoneEntry = {
    done: 0,
    total: 2,
    taskFilePaths: [
      taskFilePathFixture("tasks/a.md"),
      taskFilePathFixture("tasks/b.md"),
    ],
  };
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
    new Map([["v1", milestoneEntry]]),
  );

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
    milestoneProjections: milestoneProjectionOf(0, 2, [
      taskFilePathFixture("tasks/a.md"),
      taskFilePathFixture("tasks/b.md"),
    ]),
    taskTree: [],
  });

  expect(next).toBe(data);
  expect(next.milestoneProjections.get("v1")).toBe(milestoneEntry);
});

const loadWarning = (message: string): ProjectLoadWarning => ({
  code: "unreadableFile",
  stage: "read",
  path: taskFilePathFixture("tasks/broken.md"),
  message,
  recoverable: true,
});

test("同一fingerprintのloadWarningsではProjectDataと配列参照を保持する", () => {
  const previous = [loadWarning("読めません")];
  const data = {
    ...baseData([Task.fromPayload(payload())], new Map()),
    loadWarnings: previous,
  };
  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
    loadWarnings: [loadWarning("読めません")],
  });

  expect(next).toBe(data);
  expect(next.loadWarnings).toBe(previous);
});

test("loadWarningsは内容変更と空配列への遷移をatomicに反映する", () => {
  const data = {
    ...baseData([Task.fromPayload(payload())], new Map()),
    loadWarnings: [loadWarning("最初")],
  };
  const changed = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
    loadWarnings: [loadWarning("次")],
  });
  const cleared = ProjectData.resyncTasks(changed, {
    tasks: [Task.fromPayload(payload())],
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
    loadWarnings: [],
  });

  expect(changed.loadWarnings).toHaveLength(1);
  expect(changed.loadWarnings[0].message).toBe("次");
  expect(cleared.loadWarnings).toEqual([]);
});

// ───────── taskTree の atomic 更新 ─────────

const treeOf = (...filePaths: string[]): TaskForest =>
  TaskForest.fromPayload(
    filePaths.map((filePath) => ({ filePath, children: [] })),
  );

test("tasks / projections / tree すべて等価な resync では data 参照が変わらない", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
    MilestoneProjection.emptyMap,
    treeOf(taskFilePathFixture("tasks/a.md")),
  );

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
    milestoneProjections: MilestoneProjection.emptyMap,
    taskTree: treeOf(taskFilePathFixture("tasks/a.md")),
  });

  expect(next).toBe(data);
});

test("tasks と taskTree が同じ snapshot として同時に更新される", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
    MilestoneProjection.emptyMap,
    treeOf(taskFilePathFixture("tasks/a.md")),
  );
  const taskTree = TaskForest.fromPayload([
    {
      filePath: taskFilePathFixture("tasks/a.md"),
      children: [{ filePath: taskFilePathFixture("tasks/b.md"), children: [] }],
    },
  ]);

  const next = ProjectData.resyncTasks(data, {
    tasks: [
      Task.fromPayload(payload()),
      Task.fromPayload(
        payload({ id: "b", filePath: taskFilePathFixture("tasks/b.md") }),
      ),
    ],
    projections: projectionOf(taskFilePathFixture("tasks/a.md"), false),
    milestoneProjections: MilestoneProjection.emptyMap,
    taskTree,
  });

  expect(next.tasks).toHaveLength(2);
  expect(next.taskTree).toBe(taskTree);
});

test("tree だけ変化した resync でも新しい構造が反映される", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
    MilestoneProjection.emptyMap,
    treeOf(
      taskFilePathFixture("tasks/a.md"),
      taskFilePathFixture("tasks/b.md"),
    ),
  );
  const taskTree = TaskForest.fromPayload([
    {
      filePath: taskFilePathFixture("tasks/a.md"),
      children: [{ filePath: taskFilePathFixture("tasks/b.md"), children: [] }],
    },
  ]);

  const next = ProjectData.resyncTasks(data, {
    tasks: data.tasks,
    projections: data.projections,
    milestoneProjections: data.milestoneProjections,
    taskTree,
  });

  expect(next).not.toBe(data);
  expect(next.taskTree).toBe(taskTree);
});

test("全タスク削除後の rescan では taskTree が空になる", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf(taskFilePathFixture("tasks/a.md"), false),
    MilestoneProjection.emptyMap,
    treeOf(taskFilePathFixture("tasks/a.md")),
  );

  const next = ProjectData.resyncTasks(data, {
    tasks: [],
    projections: new Map(),
    milestoneProjections: MilestoneProjection.emptyMap,
    taskTree: [],
  });

  expect(next.tasks).toHaveLength(0);
  expect(next.taskTree).toHaveLength(0);
});
