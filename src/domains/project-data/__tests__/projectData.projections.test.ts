import { expect, test } from "vitest";
import type { ProjectData as ProjectDataT } from "@/domains/project-data";
import { ProjectData as ProjectDataDomain } from "@/domains/project-data";
import type {
  TaskProjectionMap,
  TaskProjection as TaskProjectionT,
} from "@/domains/task-projection";
import { TaskProjection } from "@/domains/task-projection";
import type { Column } from "@/types/column";
import { Task } from "@/types/task";

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

const projectionOf = (done: number, total: number): TaskProjectionT => ({
  subIssueProgress: { done, total },
  isDone: false,
  childFilePaths: ["tasks/c.md"],
});

const dataWith = (projections: TaskProjectionMap): ProjectDataT => ({
  tasks: [makeTask("tasks/a.md")],
  columns,
  doneColumn: "Done",
  projections,
  openRequestId: 1,
});

test("replaceProjections は projections だけを差し替える", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = ProjectDataDomain.replaceProjections(
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

  const next = ProjectDataDomain.replaceProjections(
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

  const next = ProjectDataDomain.replaceProjections(data, new Map());

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

  const next = ProjectDataDomain.replaceProjections(
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

  const next = ProjectDataDomain.replaceProjections(
    data,
    new Map([["tasks/b.md", projectionOf(1, 1)]]),
  );

  expect(next.projections.get("tasks/b.md")).not.toBe(changed);
  expect(next.projections.get("tasks/b.md")?.subIssueProgress.done).toBe(1);
});

test("全エントリが等価なら Map インスタンスごと据え置く", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = ProjectDataDomain.replaceProjections(
    data,
    new Map([["tasks/a.md", projectionOf(0, 2)]]),
  );

  expect(next.projections).toBe(data.projections);
});

test("全エントリが等価なら ProjectData オブジェクトごと据え置く", () => {
  const data = dataWith(new Map([["tasks/a.md", projectionOf(0, 2)]]));

  const next = ProjectDataDomain.replaceProjections(
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

  const next = ProjectDataDomain.replaceProjections(
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

  const next = ProjectDataDomain.replaceProjections(
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
