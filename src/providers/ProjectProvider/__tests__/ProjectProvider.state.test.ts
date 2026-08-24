import { expect, test } from "vitest";
import {
  makeTask,
  taskFilePathFixture,
} from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import {
  initialState,
  type ProjectAction,
  type ProjectData,
  reducer,
} from "../reducer";
import type { ProjectState } from "../state/projectState";

const cols = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

const dataA: ProjectData = {
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [
    makeTask({
      id: "a",
      filePath: taskFilePathFixture("tasks/a.md"),
      status: "Todo",
    }),
  ],
  columns: cols("Todo", "Done"),
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
};

const dataB: ProjectData = {
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [
    makeTask({
      id: "b",
      filePath: taskFilePathFixture("tasks/b.md"),
      status: "Done",
    }),
  ],
  columns: cols("Todo", "Done"),
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
};

const loadedAState: ProjectState = {
  kind: "loaded",
  path: "/a",
  data: dataA,
};

test("初期 state は idle", () => {
  expect(initialState).toEqual({ kind: "idle" });
});

test("open-start (idle 起点) → loading", () => {
  const next = reducer({ kind: "idle" }, { type: "open-start", path: "/a" });
  expect(next).toEqual({
    kind: "loading",
    path: "/a",
    previousLoaded: undefined,
  });
});

test("open-start (loaded 起点) → loading に切り替わり、復元用 data を保持する", () => {
  const next = reducer(loadedAState, { type: "open-start", path: "/b" });
  expect(next).toEqual({
    kind: "loading",
    path: "/b",
    previousLoaded: { path: "/a", data: dataA },
  });
});

test("open-succeed → loaded", () => {
  const start = reducer({ kind: "idle" }, { type: "open-start", path: "/a" });
  const next = reducer(start, {
    type: "open-succeed",
    path: "/a",
    data: dataA,
  });
  expect(next).toEqual({ kind: "loaded", path: "/a", data: dataA });
});

test("open-succeed は task と milestone の projection map を同時に設定する", () => {
  const projections = new Map([
    [
      taskFilePathFixture("tasks/a.md"),
      {
        subIssueProgress: { done: 1, total: 2 },
        isDone: false,
        childFilePaths: [taskFilePathFixture("tasks/child.md")],
      },
    ],
  ]);
  const milestoneProjections = new Map([
    [
      "v1",
      {
        done: 1,
        total: 2,
        taskFilePaths: [
          taskFilePathFixture("tasks/a.md"),
          taskFilePathFixture("tasks/child.md"),
        ],
      },
    ],
  ]);
  const data = { ...dataA, projections, milestoneProjections };
  const start = reducer({ kind: "idle" }, { type: "open-start", path: "/a" });

  const next = reducer(start, {
    type: "open-succeed",
    path: "/a",
    data,
  });

  expect(next.kind === "loaded" ? next.data.projections : undefined).toBe(
    projections,
  );
  expect(
    next.kind === "loaded" ? next.data.milestoneProjections : undefined,
  ).toBe(milestoneProjections);
  expect(next.kind === "loaded" ? next.data.projections : undefined).not.toBe(
    dataA.projections,
  );
  expect(
    next.kind === "loaded" ? next.data.milestoneProjections : undefined,
  ).not.toBe(dataA.milestoneProjections);
});

test("open-fail (loading) → error", () => {
  const start = reducer({ kind: "idle" }, { type: "open-start", path: "/a" });
  const err = new TauriError("UNKNOWN", "boom");
  const next = reducer(start, { type: "open-fail", path: "/a", error: err });
  expect(next).toEqual({ kind: "error", path: "/a", error: err });
});

test("open-fail (loaded 起点の loading) → 直前の loaded に復元", () => {
  const start = reducer(loadedAState, { type: "open-start", path: "/b" });
  const err = new TauriError("NOT_FOUND", "fail");
  const next = reducer(start, { type: "open-fail", path: "/b", error: err });
  expect(next).toEqual({ kind: "loaded", path: "/a", data: dataA });
  expect(next.kind === "loaded" ? next.data.projections : undefined).toBe(
    dataA.projections,
  );
  expect(
    next.kind === "loaded" ? next.data.milestoneProjections : undefined,
  ).toBe(dataA.milestoneProjections);
});

test("task-created → state.data.tasks 末尾に追加", () => {
  const created = makeTask({
    id: "new",
    filePath: taskFilePathFixture("tasks/new.md"),
  });
  const next = reducer(loadedAState, { type: "task-created", task: created });
  expect(next.kind).toBe("loaded");
  expect((next as { data: ProjectData }).data.tasks).toEqual([
    dataA.tasks[0],
    created,
  ]);
});

test("task-created (parent あり) → 親タスクの children に新規 filePath を冪等に追加", () => {
  const parent = makeTask({
    id: "p",
    filePath: taskFilePathFixture("tasks/p.md"),
    status: "Todo",
    children: [],
  });
  const loadedWithParent: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [parent],
      columns: cols("Todo"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const child = makeTask({
    id: "c",
    filePath: taskFilePathFixture("tasks/c.md"),
    status: "Todo",
    parent: taskFilePathFixture("tasks/p.md"),
  });
  const next = reducer(loadedWithParent, { type: "task-created", task: child });
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(tasks).toHaveLength(2);
  const parentAfter = tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/p.md"),
  );
  expect(parentAfter?.hierarchy.childFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("task-created (parent 表記ゆれあり) → 親タスクの children に新規 filePath を追加", () => {
  const parent = makeTask({
    id: "p",
    filePath: taskFilePathFixture("tasks/p.md"),
    children: [],
  });
  const loadedWithParent: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [parent],
      columns: cols("Todo"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const child = makeTask({
    id: "c",
    filePath: taskFilePathFixture("tasks/c.md"),
    parent: ".\\tasks\\p.md",
  });
  const next = reducer(loadedWithParent, { type: "task-created", task: child });
  const parentAfter = (next as { data: ProjectData }).data.tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/p.md"),
  );

  expect(parentAfter?.hierarchy.childFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("task-created (parent あり) で親が既に children を持っていれば二重追加しない (冪等)", () => {
  const parent = makeTask({
    id: "p",
    filePath: taskFilePathFixture("tasks/p.md"),
    children: [taskFilePathFixture("tasks/c.md")],
  });
  const loadedWithParent: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [parent],
      columns: cols("Todo"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const child = makeTask({
    id: "c",
    filePath: taskFilePathFixture("tasks/c.md"),
    parent: taskFilePathFixture("tasks/p.md"),
  });
  const next = reducer(loadedWithParent, { type: "task-created", task: child });
  const parentAfter = (next as { data: ProjectData }).data.tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/p.md"),
  );
  expect(parentAfter?.hierarchy.childFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
});

test("task-updated → originalFilePath 一致で差し替え", () => {
  const updated = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    title: "renamed",
    status: "Done",
  });
  const next = reducer(loadedAState, {
    type: "task-updated",
    originalFilePath: taskFilePathFixture("tasks/a.md"),
    task: updated,
  });
  expect(next.kind).toBe("loaded");
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe("renamed");
  expect(tasks[0].status).toBe("Done");
});

test("task-updated → BE が filePath を変更しても originalFilePath で既存エントリを正しく差し替える", () => {
  const renamed = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a-renamed.md"), // BE がタイトル由来で filePath を再生成したケース
    title: "renamed",
  });
  const next = reducer(loadedAState, {
    type: "task-updated",
    originalFilePath: taskFilePathFixture("tasks/a.md"),
    task: renamed,
  });
  expect(next.kind).toBe("loaded");
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].filePath).toBe(taskFilePathFixture("tasks/a-renamed.md"));
  expect(tasks[0].title).toBe("renamed");
});

test("task-deleted → 削除 filePath を他 task の links / reverseLinks からも除去", () => {
  const a = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    links: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/c.md"),
    ],
    reverseLinks: [taskFilePathFixture("tasks/b.md")],
  });
  const b = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    links: [taskFilePathFixture("tasks/a.md")],
    reverseLinks: [taskFilePathFixture("tasks/a.md")],
  });
  const c = makeTask({ id: "c", filePath: taskFilePathFixture("tasks/c.md") });
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [a, b, c],
      columns: cols("Todo"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  // b を削除すると、a の links と reverseLinks から tasks/b.md が消える
  const next = reducer(loaded, {
    type: "task-deleted",
    filePath: taskFilePathFixture("tasks/b.md"),
  });
  const tasks = (next as { data: ProjectData }).data.tasks;
  const aAfter = tasks.find(
    (t) => t.filePath === taskFilePathFixture("tasks/a.md"),
  );
  expect(aAfter?.links.linkedFilePaths).toEqual([
    taskFilePathFixture("tasks/c.md"),
  ]);
  expect(aAfter?.links.reverseLinkedFilePaths).toEqual([]);
});

test("task-deleted → filePath 一致で除去", () => {
  const next = reducer(loadedAState, {
    type: "task-deleted",
    filePath: taskFilePathFixture("tasks/a.md"),
  });
  expect(next.kind).toBe("loaded");
  expect((next as { data: ProjectData }).data.tasks).toEqual([]);
});

test("task-deleted → orphanStrategy=clear 整合: 子の parent を未設定にし、他 task の children からも除去", () => {
  const parent = makeTask({
    id: "p",
    filePath: taskFilePathFixture("tasks/p.md"),
    children: [taskFilePathFixture("tasks/c.md")],
  });
  const child = makeTask({
    id: "c",
    filePath: taskFilePathFixture("tasks/c.md"),
    parent: taskFilePathFixture("tasks/p.md"),
  });
  const otherWithLink = makeTask({
    id: "o",
    filePath: taskFilePathFixture("tasks/o.md"),
    children: [taskFilePathFixture("tasks/c.md")], // 別経路で c を子に持つ task もクリア対象
  });
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [parent, child, otherWithLink],
      columns: cols("Todo"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  // 親 (p) を削除した場合、子 (c) の parent と other (o) の children をクリア
  const next = reducer(loaded, {
    type: "task-deleted",
    filePath: taskFilePathFixture("tasks/p.md"),
  });
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(
    tasks.find((t) => t.filePath === taskFilePathFixture("tasks/p.md")),
  ).toBeUndefined();
  expect(
    tasks.find((t) => t.filePath === taskFilePathFixture("tasks/c.md"))
      ?.hierarchy.parentFilePath,
  ).toBeUndefined();
  // c を子として削除した場合の other.children クリア検証
  const next2 = reducer(loaded, {
    type: "task-deleted",
    filePath: taskFilePathFixture("tasks/c.md"),
  });
  const tasks2 = (next2 as { data: ProjectData }).data.tasks;
  expect(
    tasks2.find((t) => t.filePath === taskFilePathFixture("tasks/p.md"))
      ?.hierarchy.childFilePaths,
  ).toEqual([]);
  expect(
    tasks2.find((t) => t.filePath === taskFilePathFixture("tasks/o.md"))
      ?.hierarchy.childFilePaths,
  ).toEqual([]);
});

test("task-deleted → parent 表記ゆれがある子の parent も未設定にする", () => {
  const parent = makeTask({
    id: "p",
    filePath: taskFilePathFixture("tasks/p.md"),
  });
  const child = makeTask({
    id: "c",
    filePath: taskFilePathFixture("tasks/c.md"),
    parent: "./tasks/p.md",
  });
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [parent, child],
      columns: cols("Todo"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };

  const next = reducer(loaded, {
    type: "task-deleted",
    filePath: taskFilePathFixture("tasks/p.md"),
  });
  const tasks = (next as { data: ProjectData }).data.tasks;

  expect(
    tasks.find((t) => t.filePath === taskFilePathFixture("tasks/c.md"))
      ?.hierarchy.parentFilePath,
  ).toBeUndefined();
});

test("columns-replaced (renames なし) → columns 置き換え、tasks 不変", () => {
  const next = reducer(loadedAState, {
    type: "columns-replaced",
    columns: cols("A", "B", "C"),
  });
  expect(next.kind).toBe("loaded");
  const data = (next as { data: ProjectData }).data;
  expect(data.columns.map((c) => c.name)).toEqual(["A", "B", "C"]);
  expect(data.tasks).toEqual(dataA.tasks);
});

test("columns-replaced (renames あり) → columns 置き換え + tasks status を rename map で書き換え", () => {
  const next = reducer(loadedAState, {
    type: "columns-replaced",
    columns: cols("Backlog", "Done"),
    renames: [{ from: "Todo", to: "Backlog" }],
  });
  expect(next.kind).toBe("loaded");
  const data = (next as { data: ProjectData }).data;
  expect(data.columns.map((c) => c.name)).toEqual(["Backlog", "Done"]);
  expect(data.tasks[0].status).toBe("Backlog");
});

test("columns-replaced: doneColumn が rename 対象なら自動追従する", () => {
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [],
      columns: cols("Todo", "Done"),
      doneColumn: "Done",
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const next = reducer(loaded, {
    type: "columns-replaced",
    columns: cols("Todo", "完了"),
    renames: [{ from: "Done", to: "完了" }],
  });
  const data = (next as { data: ProjectData }).data;
  expect(data.doneColumn).toBe("完了");
});

test("columns-replaced: action.doneColumn 指定時はそれが採用される (rename 自動追従より優先)", () => {
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [],
      columns: cols("Todo", "Done"),
      doneColumn: "Done",
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const next = reducer(loaded, {
    type: "columns-replaced",
    columns: cols("Todo"),
    doneColumn: "Todo",
  });
  const data = (next as { data: ProjectData }).data;
  expect(data.doneColumn).toBe("Todo");
});

test("columns-replaced: doneColumn / renames 未指定時は既存値を維持", () => {
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [],
      columns: cols("Todo", "Done"),
      doneColumn: "Done",
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const next = reducer(loaded, {
    type: "columns-replaced",
    columns: cols("Todo", "Done", "Backlog"),
  });
  const data = (next as { data: ProjectData }).data;
  expect(data.doneColumn).toBe("Done");
});

test("reset → idle", () => {
  const next = reducer(loadedAState, { type: "reset" });
  expect(next).toEqual({ kind: "idle" });
});

test.for<[string, ProjectAction]>([
  [
    "task-created (idle)",
    {
      type: "task-created",
      task: makeTask({ id: "x", filePath: taskFilePathFixture("tasks/x.md") }),
    },
  ],
  [
    "task-updated (idle)",
    {
      type: "task-updated",
      originalFilePath: taskFilePathFixture("tasks/x.md"),
      task: makeTask({ id: "x", filePath: taskFilePathFixture("tasks/x.md") }),
    },
  ],
  [
    "task-deleted (idle)",
    { type: "task-deleted", filePath: taskFilePathFixture("tasks/x.md") },
  ],
  ["columns-replaced (idle)", { type: "columns-replaced", columns: cols("X") }],
])("loaded 以外で %s は state 不変", ([, action]) => {
  const idle: ProjectState = { kind: "idle" };
  expect(reducer(idle, action)).toBe(idle);
});

test("open-start (loading 起点) → loading: 既存 previousLoaded を引き継ぐ", () => {
  const stepB = reducer(loadedAState, { type: "open-start", path: "/b" });
  const stepC = reducer(stepB, { type: "open-start", path: "/c" });
  expect(stepC).toEqual({
    kind: "loading",
    path: "/c",
    previousLoaded: { path: "/a", data: dataA },
  });
  const failC = reducer(stepC, {
    type: "open-fail",
    path: "/c",
    error: new TauriError("UNKNOWN", "x"),
  });
  expect(failC).toEqual({ kind: "loaded", path: "/a", data: dataA });
});

test("dataB を別途 loaded に持つ場合も open-fail 復元先が正しい", () => {
  const loadedB: ProjectState = { kind: "loaded", path: "/b", data: dataB };
  const start = reducer(loadedB, { type: "open-start", path: "/c" });
  const err = new TauriError("UNKNOWN", "x");
  const next = reducer(start, { type: "open-fail", path: "/c", error: err });
  expect(next).toEqual({ kind: "loaded", path: "/b", data: dataB });
});

test("card-order-updated → 対象カラムの tasks が filePaths 順に並ぶ", () => {
  const todoA = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    status: "Todo",
  });
  const todoB = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    status: "Todo",
  });
  const doneX = makeTask({
    id: "x",
    filePath: taskFilePathFixture("tasks/x.md"),
    status: "Done",
  });
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/p",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [todoA, doneX, todoB],
      columns: cols("Todo", "Done"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const next = reducer(loaded, {
    type: "card-order-updated",
    columnName: "Todo",
    filePaths: [
      taskFilePathFixture("tasks/b.md"),
      taskFilePathFixture("tasks/a.md"),
    ],
  });
  const data = (next as { data: ProjectData }).data;
  expect(data.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/b.md"),
    taskFilePathFixture("tasks/x.md"),
    taskFilePathFixture("tasks/a.md"),
  ]);
});

test("card-order-updated → 他カラムの tasks 順序は不変", () => {
  const todoA = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    status: "Todo",
  });
  const doneX = makeTask({
    id: "x",
    filePath: taskFilePathFixture("tasks/x.md"),
    status: "Done",
  });
  const doneY = makeTask({
    id: "y",
    filePath: taskFilePathFixture("tasks/y.md"),
    status: "Done",
  });
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/p",
    data: {
      watcherSession: WATCHER_SESSION_FIXTURE,
      tasks: [todoA, doneX, doneY],
      columns: cols("Todo", "Done"),
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
      openRequestId: 0,
      loadWarnings: [],
    },
  };
  const next = reducer(loaded, {
    type: "card-order-updated",
    columnName: "Todo",
    filePaths: [taskFilePathFixture("tasks/a.md")],
  });
  const data = (next as { data: ProjectData }).data;
  expect(data.tasks.map((t) => t.filePath)).toEqual([
    taskFilePathFixture("tasks/a.md"),
    taskFilePathFixture("tasks/x.md"),
    taskFilePathFixture("tasks/y.md"),
  ]);
});

test("card-order-updated → idle state では no-op", () => {
  const idle: ProjectState = { kind: "idle" };
  const next = reducer(idle, {
    type: "card-order-updated",
    columnName: "Todo",
    filePaths: [taskFilePathFixture("tasks/a.md")],
  });
  expect(next).toBe(idle);
});

// ───────── projections / tasks resync ─────────

test("projections-refreshed は task と milestone の projection map を同時に更新する", () => {
  const projections = new Map([
    [
      taskFilePathFixture("tasks/a.md"),
      {
        subIssueProgress: { done: 0, total: 1 },
        isDone: false,
        childFilePaths: [taskFilePathFixture("tasks/child.md")],
      },
    ],
  ]);
  const milestoneProjections = new Map([
    [
      "release",
      { done: 0, total: 1, taskFilePaths: [taskFilePathFixture("tasks/a.md")] },
    ],
  ]);

  const next = reducer(loadedAState, {
    type: "projections-refreshed",
    projections,
    milestoneProjections,
    taskTree: [],
  });

  expect(next.kind === "loaded" ? next.data.projections : undefined).toEqual(
    projections,
  );
  expect(
    next.kind === "loaded" ? next.data.milestoneProjections : undefined,
  ).toEqual(milestoneProjections);
  expect(next.kind === "loaded" ? next.data.projections : undefined).not.toBe(
    dataA.projections,
  );
  expect(
    next.kind === "loaded" ? next.data.milestoneProjections : undefined,
  ).not.toBe(dataA.milestoneProjections);
});

test("非 loaded state への projections-refreshed は両 map を変更しない", () => {
  const idle: ProjectState = { kind: "idle" };

  const next = reducer(idle, {
    type: "projections-refreshed",
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
  });

  expect(next).toBe(idle);
});

// ───────── tasks-resynced（watcher の full rescan / gap 復旧） ─────────

test("tasks-resynced は tasks と両 projection map を更新し columns は変えない", () => {
  const projections = new Map([
    [
      taskFilePathFixture("tasks/z.md"),
      {
        subIssueProgress: { done: 0, total: 0 },
        isDone: true,
        childFilePaths: [],
      },
    ],
  ]);
  const milestoneProjections = new Map([
    [
      "v2",
      { done: 1, total: 1, taskFilePaths: [taskFilePathFixture("tasks/z.md")] },
    ],
  ]);
  const next = reducer(loadedAState, {
    type: "tasks-resynced",
    tasks: [
      makeTask({
        id: "z",
        filePath: taskFilePathFixture("tasks/z.md"),
        status: "Done",
      }),
    ],
    projections,
    milestoneProjections,
    taskTree: [],
    loadWarnings: [],
  });

  expect(next.kind).toBe("loaded");
  const data = next.kind === "loaded" ? next.data : undefined;
  expect(data?.tasks.map((task) => task.id)).toEqual(["z"]);
  expect(data?.columns).toBe(dataA.columns);
  expect(data?.projections).toEqual(projections);
  expect(data?.milestoneProjections).toEqual(milestoneProjections);
  expect(data?.openRequestId).toBe(dataA.openRequestId);
  expect(data?.watcherSession).toBe(dataA.watcherSession);
});

test("state-replaced は ProjectData 全体を置き換え、tasks-resynced は tasks / projections だけ前進する", () => {
  const replaced = reducer(loadedAState, {
    type: "state-replaced",
    data: dataB,
  });
  const resynced = reducer(loadedAState, {
    type: "tasks-resynced",
    tasks: dataB.tasks,
    projections: dataB.projections,
    milestoneProjections: dataB.milestoneProjections,
    taskTree: [],
    loadWarnings: [],
  });

  const replacedData = replaced.kind === "loaded" ? replaced.data : undefined;
  const resyncedData = resynced.kind === "loaded" ? resynced.data : undefined;
  expect(replacedData).toBe(dataB);
  expect(resyncedData?.columns).toBe(dataA.columns);
});

test("非 loaded state への tasks-resynced は無視される", () => {
  const idle: ProjectState = { kind: "idle" };

  const next = reducer(idle, {
    type: "tasks-resynced",
    tasks: dataB.tasks,
    projections: new Map(),
    milestoneProjections: new Map(),
    taskTree: [],
    loadWarnings: [],
  });

  expect(next).toBe(idle);
});
