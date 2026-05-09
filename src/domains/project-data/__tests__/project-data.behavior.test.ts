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
