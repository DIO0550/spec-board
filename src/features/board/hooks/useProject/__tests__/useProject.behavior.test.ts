import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import {
  initialState,
  type ProjectAction,
  type ProjectData,
  type ProjectState,
  reducer,
} from "../reducer";

const makeTask = (overrides: Partial<Task> & Pick<Task, "id">): Task => ({
  id: overrides.id,
  title: overrides.title ?? "t",
  status: overrides.status ?? "Todo",
  labels: overrides.labels ?? [],
  parent: overrides.parent,
  links: overrides.links ?? [],
  children: overrides.children ?? [],
  reverseLinks: overrides.reverseLinks ?? [],
  body: overrides.body ?? "",
  filePath: overrides.filePath ?? `tasks/${overrides.id}.md`,
  priority: overrides.priority,
});

const cols = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

const dataA: ProjectData = {
  tasks: [makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" })],
  columns: cols("Todo", "Done"),
};

const dataB: ProjectData = {
  tasks: [makeTask({ id: "b", filePath: "tasks/b.md", status: "Done" })],
  columns: cols("Todo", "Done"),
};

const loadedAState: ProjectState = {
  kind: "loaded",
  path: "/a",
  data: dataA,
};

test("初期 state は idle", () => {
  expect(initialState).toEqual({ kind: "idle" });
});

test("open-start (idle 起点) → loading (previousLoaded なし)", () => {
  const next = reducer({ kind: "idle" }, { type: "open-start", path: "/a" });
  expect(next).toEqual({
    kind: "loading",
    path: "/a",
    previousLoaded: undefined,
  });
});

test("open-start (loaded 起点) → loading (previousLoaded セット)", () => {
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

test("open-fail (loading で previousLoaded なし) → error", () => {
  const start = reducer({ kind: "idle" }, { type: "open-start", path: "/a" });
  const err = new TauriError("UNKNOWN", "boom");
  const next = reducer(start, { type: "open-fail", path: "/a", error: err });
  expect(next).toEqual({ kind: "error", path: "/a", error: err });
});

test("open-fail (loading で previousLoaded あり) → 直前の loaded に復元 (Board 維持要件)", () => {
  const start = reducer(loadedAState, { type: "open-start", path: "/b" });
  const err = new TauriError("NOT_FOUND", "fail");
  const next = reducer(start, { type: "open-fail", path: "/b", error: err });
  expect(next).toEqual({ kind: "loaded", path: "/a", data: dataA });
});

test("task-created → state.data.tasks 末尾に追加", () => {
  const created = makeTask({ id: "new", filePath: "tasks/new.md" });
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
    filePath: "tasks/p.md",
    status: "Todo",
    children: [],
  });
  const loadedWithParent: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: { tasks: [parent], columns: cols("Todo") },
  };
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    status: "Todo",
    parent: "tasks/p.md",
  });
  const next = reducer(loadedWithParent, { type: "task-created", task: child });
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(tasks).toHaveLength(2);
  const parentAfter = tasks.find((t) => t.filePath === "tasks/p.md");
  expect(parentAfter?.children).toEqual(["tasks/c.md"]);
});

test("task-created (parent あり) で親が既に children を持っていれば二重追加しない (冪等)", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c.md"],
  });
  const loadedWithParent: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: { tasks: [parent], columns: cols("Todo") },
  };
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
  });
  const next = reducer(loadedWithParent, { type: "task-created", task: child });
  const parentAfter = (next as { data: ProjectData }).data.tasks.find(
    (t) => t.filePath === "tasks/p.md",
  );
  expect(parentAfter?.children).toEqual(["tasks/c.md"]);
});

test("task-updated → originalFilePath 一致で差し替え", () => {
  const updated = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    title: "renamed",
    status: "Done",
  });
  const next = reducer(loadedAState, {
    type: "task-updated",
    originalFilePath: "tasks/a.md",
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
    filePath: "tasks/a-renamed.md", // BE がタイトル由来で filePath を再生成したケース
    title: "renamed",
  });
  const next = reducer(loadedAState, {
    type: "task-updated",
    originalFilePath: "tasks/a.md",
    task: renamed,
  });
  expect(next.kind).toBe("loaded");
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].filePath).toBe("tasks/a-renamed.md");
  expect(tasks[0].title).toBe("renamed");
});

test("task-deleted → filePath 一致で除去", () => {
  const next = reducer(loadedAState, {
    type: "task-deleted",
    filePath: "tasks/a.md",
  });
  expect(next.kind).toBe("loaded");
  expect((next as { data: ProjectData }).data.tasks).toEqual([]);
});

test("task-deleted → orphanStrategy=clear 整合: 子の parent を未設定にし、他 task の children からも除去", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c.md"],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
  });
  const otherWithLink = makeTask({
    id: "o",
    filePath: "tasks/o.md",
    children: ["tasks/c.md"], // 別経路で c を子に持つ task もクリア対象
  });
  const loaded: ProjectState = {
    kind: "loaded",
    path: "/x",
    data: {
      tasks: [parent, child, otherWithLink],
      columns: cols("Todo"),
    },
  };
  // 親 (p) を削除した場合、子 (c) の parent と other (o) の children をクリア
  const next = reducer(loaded, {
    type: "task-deleted",
    filePath: "tasks/p.md",
  });
  const tasks = (next as { data: ProjectData }).data.tasks;
  expect(tasks.find((t) => t.filePath === "tasks/p.md")).toBeUndefined();
  expect(
    tasks.find((t) => t.filePath === "tasks/c.md")?.parent,
  ).toBeUndefined();
  // c を子として削除した場合の other.children クリア検証
  const next2 = reducer(loaded, {
    type: "task-deleted",
    filePath: "tasks/c.md",
  });
  const tasks2 = (next2 as { data: ProjectData }).data.tasks;
  expect(tasks2.find((t) => t.filePath === "tasks/p.md")?.children).toEqual([]);
  expect(tasks2.find((t) => t.filePath === "tasks/o.md")?.children).toEqual([]);
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
    data: { tasks: [], columns: cols("Todo", "Done"), doneColumn: "Done" },
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
    data: { tasks: [], columns: cols("Todo", "Done"), doneColumn: "Done" },
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
    data: { tasks: [], columns: cols("Todo", "Done"), doneColumn: "Done" },
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
      task: makeTask({ id: "x", filePath: "tasks/x.md" }),
    },
  ],
  [
    "task-updated (idle)",
    {
      type: "task-updated",
      originalFilePath: "tasks/x.md",
      task: makeTask({ id: "x", filePath: "tasks/x.md" }),
    },
  ],
  ["task-deleted (idle)", { type: "task-deleted", filePath: "tasks/x.md" }],
  ["columns-replaced (idle)", { type: "columns-replaced", columns: cols("X") }],
])("loaded 以外で %s は state 不変", ([, action]) => {
  const idle: ProjectState = { kind: "idle" };
  expect(reducer(idle, action)).toBe(idle);
});

test("open-start (loading 起点) → loading: 既存 previousLoaded を引き継ぐ", () => {
  // loaded(A) → loading(B, prev=A) → loading(C, prev=A) と遷移し、
  // C が失敗しても A に復元できることを確認
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

test("dataB を別途 loaded に持ち、open-fail 復元先が正しい", () => {
  const loadedB: ProjectState = { kind: "loaded", path: "/b", data: dataB };
  const start = reducer(loadedB, { type: "open-start", path: "/c" });
  const err = new TauriError("UNKNOWN", "x");
  const next = reducer(start, { type: "open-fail", path: "/c", error: err });
  expect(next).toEqual({ kind: "loaded", path: "/b", data: dataB });
});
