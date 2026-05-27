import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
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
    tasks: [parent],
    columns: columns("Todo"),
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
    tasks: [parent],
    columns: columns("Todo"),
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
    tasks: [current],
    columns: columns("Todo"),
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
    tasks: [oldParent, newParent, child],
    columns: columns("Todo"),
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
    tasks: [oldParent, newParent, child],
    columns: columns("Todo"),
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
    tasks: [newParent, orphan],
    columns: columns("Todo"),
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
    tasks: [oldParent, child],
    columns: columns("Todo"),
  };

  const next = ProjectData.applyTaskUpdated(data, "tasks/c.md", updated);

  const oldAfter = next.tasks.find((t) => t.filePath === "tasks/old.md");
  expect(oldAfter?.hierarchy.childFilePaths).toEqual([]);
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
    tasks: [parent, child],
    columns: columns("Todo"),
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
    tasks: [parent, child],
    columns: columns("Todo"),
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
    tasks: [task],
    columns: columns("Todo", "Done"),
    doneColumn: "Done",
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
    tasks: [],
    columns: columns("Todo", "Done"),
    doneColumn: "Done",
  };

  const next = ProjectData.replaceColumns(data, {
    columns: columns("Todo"),
    doneColumn: "Todo",
  });

  expect(next.doneColumn).toBe("Todo");
});
