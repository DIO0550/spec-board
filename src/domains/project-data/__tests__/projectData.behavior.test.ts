import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import type { Column } from "@/types/column";
import { ProjectData, type ProjectData as ProjectDataT } from "..";

const columns = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

test("applyTaskCreated は task を追加し parent task の children を同期する", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: [],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: ".\\tasks\\p.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskCreated(data, child);

  expect(next.tasks).toHaveLength(2);
  expect(
    next.tasks.find((task) => task.filePath === "tasks/p.md")?.hierarchy
      .childFilePaths,
  ).toEqual(["tasks/c.md"]);
});

test("applyTaskCreated は parent children を二重追加しない", () => {
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
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskCreated(data, child);

  expect(
    next.tasks.find((task) => task.filePath === "tasks/p.md")?.hierarchy
      .childFilePaths,
  ).toEqual(["tasks/c.md"]);
});

test("applyTaskUpdated は originalFilePath に一致する task を差し替える", () => {
  const current = makeTask({ id: "a", filePath: "tasks/a.md" });
  const updated = makeTask({
    id: "a",
    filePath: "tasks/a-renamed.md",
    title: "renamed",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [current],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/a.md", updated);

  expect(next.tasks).toEqual([updated]);
});

test("applyTaskUpdated は parent が変わったとき旧親 children から該当 path を除去する", () => {
  const oldParent = makeTask({
    id: "old",
    filePath: "tasks/old.md",
    children: ["tasks/c.md"],
  });
  const newParent = makeTask({
    id: "new",
    filePath: "tasks/new.md",
    children: [],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/old.md",
  });
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/new.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [oldParent, newParent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const oldAfter = next.tasks.find((t) => t.filePath === "tasks/old.md");
  expect(oldAfter?.hierarchy.childFilePaths).toEqual([]);
});

test("applyTaskUpdated は parent が変わったとき新親 children に該当 path を追加する", () => {
  const oldParent = makeTask({
    id: "old",
    filePath: "tasks/old.md",
    children: ["tasks/c.md"],
  });
  const newParent = makeTask({
    id: "new",
    filePath: "tasks/new.md",
    children: [],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/old.md",
  });
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/new.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [oldParent, newParent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const newAfter = next.tasks.find((t) => t.filePath === "tasks/new.md");
  expect(newAfter?.hierarchy.childFilePaths).toEqual(["tasks/c.md"]);
});

test("applyTaskUpdated は parent が新規付与されたとき新親 children を更新する", () => {
  const newParent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: [],
  });
  const orphan = makeTask({
    id: "c",
    filePath: "tasks/c.md",
  });
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [newParent, orphan],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const parentAfter = next.tasks.find((t) => t.filePath === "tasks/p.md");
  expect(parentAfter?.hierarchy.childFilePaths).toEqual(["tasks/c.md"]);
});

test("applyTaskUpdated は parent が解除されたとき旧親 children からのみ除去する", () => {
  const oldParent = makeTask({
    id: "old",
    filePath: "tasks/old.md",
    children: ["tasks/c.md"],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/old.md",
  });
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [oldParent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const oldAfter = next.tasks.find((t) => t.filePath === "tasks/old.md");
  expect(oldAfter?.hierarchy.childFilePaths).toEqual([]);
});

test("applyTaskUpdated は originalFilePath が存在しないとき parent-sync を行わない（late event no-op）", () => {
  // 既に削除済みの task に対する late / out-of-order な update event を想定。
  // tasks に該当 path が無いなら、payload に parent があっても新親 childFilePaths を
  // 書き換えてはならない（dangling な child 参照を残さない）。
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: [],
  });
  const orphanUpdate = makeTask({
    id: "deleted",
    filePath: "tasks/deleted.md",
    parent: "tasks/p.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(
    data,
    "tasks/deleted.md",
    orphanUpdate,
  );

  expect(next.tasks).toHaveLength(1);
  const parentAfter = next.tasks.find((t) => t.filePath === "tasks/p.md");
  expect(parentAfter?.hierarchy.childFilePaths).toEqual([]);
  // 元 task 参照を保つ（無関係な書き換えを発生させない）
  expect(parentAfter).toBe(parent);
});

test("applyTaskUpdated は rename + reparent で旧親から originalFilePath を除去する", () => {
  // task.filePath が更新で変わるケース。旧親 childFilePaths には originalFilePath（旧パス）
  // が登録されているので、新パスで detach すると除去できずゴーストが残る。
  const oldParent = makeTask({
    id: "old",
    filePath: "tasks/old.md",
    children: ["tasks/c.md"],
  });
  const newParent = makeTask({
    id: "new",
    filePath: "tasks/new.md",
    children: [],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/old.md",
  });
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c-renamed.md",
    parent: "tasks/new.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [oldParent, newParent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const oldAfter = next.tasks.find((t) => t.filePath === "tasks/old.md");
  const newAfter = next.tasks.find((t) => t.filePath === "tasks/new.md");
  expect(oldAfter?.hierarchy.childFilePaths).toEqual([]);
  expect(newAfter?.hierarchy.childFilePaths).toEqual(["tasks/c-renamed.md"]);
});

test("applyTaskUpdated は rename のみ（parent 不変）の場合も旧親の childFilePaths を新パスへ更新する", () => {
  // parent が変わらない場合でも filePath が変わるなら、旧親の childFilePaths は古い path のまま。
  // この PR の主目的（進捗カウント整合）への影響は無いが、リネーム時の整合性を保つために
  // 旧親 children を新パスに置き換える。
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
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c-renamed.md",
    parent: "tasks/p.md",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const parentAfter = next.tasks.find((t) => t.filePath === "tasks/p.md");
  expect(parentAfter?.hierarchy.childFilePaths).toEqual(["tasks/c-renamed.md"]);
});

test("applyTaskUpdated は parent 変更がなければ他 task 参照を維持する", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c.md"],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
    title: "old",
  });
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
    title: "new",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const parentAfter = next.tasks.find((t) => t.filePath === "tasks/p.md");
  expect(parentAfter).toBe(parent);
  expect(parentAfter?.hierarchy.childFilePaths).toEqual(["tasks/c.md"]);
});

test("applyTaskDeleted は task を削除し hierarchy と links から参照を掃除する", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c.md"],
    links: ["tasks/c.md"],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
    reverseLinks: ["tasks/p.md"],
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent, child],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.applyTaskDeleted(data, "tasks/c.md");

  expect(next.tasks).toHaveLength(1);
  expect(next.tasks[0].filePath).toBe("tasks/p.md");
  expect(next.tasks[0].hierarchy.childFilePaths).toEqual([]);
  expect(next.tasks[0].links.linkedFilePaths).toEqual([]);
});

test("replaceColumns は status と doneColumn を rename に追従させる", () => {
  const task = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    status: "Done",
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [task],
    columns: columns("Todo", "Done"),
    doneColumn: "Done",
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.replaceColumns(data, {
    columns: columns("Todo", "完了"),
    renames: [{ from: "Done", to: "完了" }],
  });

  expect(next.tasks[0].status).toBe("完了");
  expect(next.doneColumn).toBe("完了");
});

test("replaceColumns は指定された doneColumn を rename 追従より優先する", () => {
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [],
    columns: columns("Todo", "Done"),
    doneColumn: "Done",
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };

  const next = ProjectData.replaceColumns(data, {
    columns: columns("Todo"),
    doneColumn: "Todo",
  });

  expect(next.doneColumn).toBe("Todo");
});

// ───────── applyTaskUpdated の childFilePaths 保持 ─────────

test("applyTaskUpdated は children 空の payload でも既存の childFilePaths を保つ", () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    children: ["tasks/c.md"],
  });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };
  // watcher の task-updated / 非 parent の update_task はどちらも children: [] を返す。
  const updated = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    title: "renamed",
    children: [],
  });

  const next = ProjectData.applyTaskUpdated(data, "tasks/p.md", updated);

  const target = next.tasks.find((task) => task.filePath === "tasks/p.md");
  expect(target?.hierarchy.childFilePaths).toEqual(["tasks/c.md"]);
  expect(target?.title).toBe("renamed");
});

test("applyTaskUpdated は payload の parentFilePath を採用する", () => {
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p1.md",
  });
  const p1 = makeTask({
    id: "p1",
    filePath: "tasks/p1.md",
    children: ["tasks/c.md"],
  });
  const p2 = makeTask({ id: "p2", filePath: "tasks/p2.md", children: [] });
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [child, p1, p2],
    columns: columns("Todo"),
    projections: new Map(),
    milestoneProjections: new Map(),
    openRequestId: 0,
    loadWarnings: [],
  };
  const updated = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p2.md",
  });

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  expect(
    next.tasks.find((task) => task.filePath === "tasks/c.md")?.hierarchy
      .parentFilePath,
  ).toBe("tasks/p2.md");
  expect(
    next.tasks.find((task) => task.filePath === "tasks/p1.md")?.hierarchy
      .childFilePaths,
  ).toEqual([]);
  expect(
    next.tasks.find((task) => task.filePath === "tasks/p2.md")?.hierarchy
      .childFilePaths,
  ).toEqual(["tasks/c.md"]);
});
