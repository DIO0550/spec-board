import { expect, test } from "vitest";
import {
  MilestoneProjection,
  type MilestoneProjectionMap,
} from "@/domains/milestone-projection";
import { ProjectData } from "@/domains/project-data";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import { WatcherSession } from "@/domains/watcher-session";
import { Task, type TaskPayload } from "@/types/task";

const payload = (overrides: Partial<TaskPayload> = {}): TaskPayload => ({
  id: "tasks/a.md",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
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
  taskFilePaths: readonly string[] = ["tasks/a.md"],
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
): ProjectData => ({
  tasks,
  columns: [{ name: "Todo", order: 0 }],
  doneColumn: "Done",
  projections,
  milestoneProjections,
  openRequestId: 7,
  watcherSession: session,
});

const resyncTaskSnapshot = (
  data: ProjectData,
  snapshot: { tasks: Task[]; projections: TaskProjectionMap },
): ProjectData =>
  ProjectData.resyncTasks(data, {
    ...snapshot,
    milestoneProjections: data.milestoneProjections,
  });

test("内容が変わった task が反映され、他フィールドは据え置かれる", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf("tasks/a.md", false),
  );

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf("tasks/a.md", false),
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
    projectionOf("tasks/a.md", false),
  );

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf("tasks/a.md", false),
  });

  expect(next).toBe(data);
});

test("3 件中 1 件だけ変わったとき、変わっていない 2 件は旧参照のまま", () => {
  const kept = [
    Task.fromPayload(payload({ filePath: "tasks/a.md", id: "tasks/a.md" })),
    Task.fromPayload(payload({ filePath: "tasks/b.md", id: "tasks/b.md" })),
  ];
  const changed = Task.fromPayload(
    payload({ filePath: "tasks/c.md", id: "tasks/c.md" }),
  );
  const data = baseData([...kept, changed], new Map());

  const next = resyncTaskSnapshot(data, {
    tasks: [
      Task.fromPayload(payload({ filePath: "tasks/a.md", id: "tasks/a.md" })),
      Task.fromPayload(payload({ filePath: "tasks/b.md", id: "tasks/b.md" })),
      Task.fromPayload(
        payload({ filePath: "tasks/c.md", id: "tasks/c.md", title: "C2" }),
      ),
    ],
    projections: new Map(),
  });

  expect(next.tasks[0]).toBe(kept[0]);
  expect(next.tasks[1]).toBe(kept[1]);
  expect(next.tasks[2]).not.toBe(changed);
});

test("tasks だけ変わったときも projections の参照は保たれる", () => {
  const projections = projectionOf("tasks/a.md", false);
  const data = baseData([Task.fromPayload(payload())], projections);

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf("tasks/a.md", false),
  });

  expect(next.projections).toBe(projections);
  expect(next.tasks).not.toBe(data.tasks);
});

test("projections だけ変わったときも tasks の参照は保たれる", () => {
  const tasks = [Task.fromPayload(payload())];
  const data = baseData(tasks, projectionOf("tasks/a.md", false));

  const next = resyncTaskSnapshot(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf("tasks/a.md", true),
  });

  expect(next.tasks).toBe(tasks);
  expect(next.projections).not.toBe(data.projections);
});

test("空 snapshot は tasks を空配列にする", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf("tasks/a.md", false),
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
      Task.fromPayload(payload({ filePath: "tasks/b.md", id: "tasks/b.md" })),
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
    projectionOf("tasks/a.md", false),
    milestoneProjectionOf(0, 1),
  );

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf("tasks/a.md", true),
    milestoneProjections: milestoneProjectionOf(1, 1),
  });

  expect(next.tasks[0].title).toBe("A2");
  expect(next.projections.get("tasks/a.md")?.isDone).toBe(true);
  expect(next.milestoneProjections.get("v1")?.done).toBe(1);
});

test("milestone projection だけ変わると tasks と task Map の参照を保つ", () => {
  const tasks = [Task.fromPayload(payload())];
  const projections = projectionOf("tasks/a.md", false);
  const data = baseData(tasks, projections, milestoneProjectionOf(0, 1));

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf("tasks/a.md", false),
    milestoneProjections: milestoneProjectionOf(1, 1),
  });

  expect(next.tasks).toBe(tasks);
  expect(next.projections).toBe(projections);
  expect(next.milestoneProjections).not.toBe(data.milestoneProjections);
});

test("tasks と両 Map が等価なら resyncTasks は ProjectData 参照を保つ", () => {
  const milestoneEntry = {
    done: 0,
    total: 2,
    taskFilePaths: ["tasks/a.md", "tasks/b.md"],
  };
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf("tasks/a.md", false),
    new Map([["v1", milestoneEntry]]),
  );

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload())],
    projections: projectionOf("tasks/a.md", false),
    milestoneProjections: milestoneProjectionOf(0, 2, [
      "tasks/a.md",
      "tasks/b.md",
    ]),
  });

  expect(next).toBe(data);
  expect(next.milestoneProjections.get("v1")).toBe(milestoneEntry);
});
