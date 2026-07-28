import { expect, test } from "vitest";
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

const session = WatcherSession.fromPayload({
  projectKey: "/home/user/specs",
  generation: 3,
  revision: 42,
  eventSeq: 17,
});

const baseData = (
  tasks: Task[],
  projections: TaskProjectionMap,
): ProjectData => ({
  tasks,
  columns: [{ name: "Todo", order: 0 }],
  doneColumn: "Done",
  projections,
  openRequestId: 7,
  watcherSession: session,
});

test("内容が変わった task が反映され、他フィールドは据え置かれる", () => {
  const data = baseData(
    [Task.fromPayload(payload())],
    projectionOf("tasks/a.md", false),
  );

  const next = ProjectData.resyncTasks(data, {
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

  const next = ProjectData.resyncTasks(data, {
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

  const next = ProjectData.resyncTasks(data, {
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

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload({ title: "A2" }))],
    projections: projectionOf("tasks/a.md", false),
  });

  expect(next.projections).toBe(projections);
  expect(next.tasks).not.toBe(data.tasks);
});

test("projections だけ変わったときも tasks の参照は保たれる", () => {
  const tasks = [Task.fromPayload(payload())];
  const data = baseData(tasks, projectionOf("tasks/a.md", false));

  const next = ProjectData.resyncTasks(data, {
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

  const next = ProjectData.resyncTasks(data, {
    tasks: [],
    projections: new Map(),
  });

  expect(next.tasks).toHaveLength(0);
});

test("件数が増えた snapshot を取りこぼさない", () => {
  const data = baseData([Task.fromPayload(payload())], new Map());

  const next = ProjectData.resyncTasks(data, {
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

  const next = ProjectData.resyncTasks(data, {
    tasks: [Task.fromPayload(payload({ status: "Doing" }))],
    projections: new Map(),
  });

  expect(next.tasks[0]).toBe(optimistic);
});
