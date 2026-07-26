import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import type { Column } from "@/types/column";
import { ProjectData, type ProjectData as ProjectDataT } from "..";

const columns = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

test("applyTaskCreated は作成タスクの links 先 target の reverseLinkedFilePaths に作成タスク path を追加する", () => {
  const target = makeTask({ id: "b", filePath: "tasks/b.md" });
  const created = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const data: ProjectDataT = {
    tasks: [target],
    columns: columns("Todo"),
    projections: new Map(),
    openRequestId: 0,
  };

  const next = ProjectData.applyTaskCreated(data, created);

  expect(
    next.tasks.find((task) => task.filePath === "tasks/b.md")?.links
      .reverseLinkedFilePaths,
  ).toEqual(["tasks/a.md"]);
});

test("applyTaskCreated は既に reverse 済みの場合は重複追加しない（冪等）", () => {
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: ["tasks/a.md"],
  });
  const created = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const data: ProjectDataT = {
    tasks: [target],
    columns: columns("Todo"),
    projections: new Map(),
    openRequestId: 0,
  };

  const next = ProjectData.applyTaskCreated(data, created);

  expect(
    next.tasks.find((task) => task.filePath === "tasks/b.md")?.links
      .reverseLinkedFilePaths,
  ).toEqual(["tasks/a.md"]);
});

test("applyTaskCreated は links 空のとき既存 task の reverse を変更しない", () => {
  const other = makeTask({ id: "b", filePath: "tasks/b.md" });
  const created = makeTask({ id: "a", filePath: "tasks/a.md" });
  const data: ProjectDataT = {
    tasks: [other],
    columns: columns("Todo"),
    projections: new Map(),
    openRequestId: 0,
  };

  const next = ProjectData.applyTaskCreated(data, created);

  expect(
    next.tasks.find((task) => task.filePath === "tasks/b.md")?.links
      .reverseLinkedFilePaths,
  ).toEqual([]);
});

test("applyTaskCreated は reverse 同期しつつ parent children 同期も維持する", () => {
  const parent = makeTask({ id: "p", filePath: "tasks/p.md" });
  const target = makeTask({ id: "b", filePath: "tasks/b.md" });
  const created = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
    links: ["tasks/b.md"],
  });
  const data: ProjectDataT = {
    tasks: [parent, target],
    columns: columns("Todo"),
    projections: new Map(),
    openRequestId: 0,
  };

  const next = ProjectData.applyTaskCreated(data, created);

  expect(
    next.tasks.find((task) => task.filePath === "tasks/p.md")?.hierarchy
      .childFilePaths,
  ).toEqual(["tasks/c.md"]);
  expect(
    next.tasks.find((task) => task.filePath === "tasks/b.md")?.links
      .reverseLinkedFilePaths,
  ).toEqual(["tasks/c.md"]);
});
