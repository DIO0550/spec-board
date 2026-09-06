import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskPathLookup } from "@/domains/task-path-lookup";
import { BrokenLinkSet } from "..";

/**
 * `tasks/a.md` と `tasks/b.md` だけが存在する lookup を作る。
 * @returns テスト用 lookup
 */
const existing = (): TaskPathLookup =>
  TaskPathLookup.fromTasks([
    makeTask({ id: "a", filePath: "tasks/a.md" }),
    makeTask({ id: "b", filePath: "tasks/b.md" }),
  ]);

test("empty は 4 種とも broken なしを表す", () => {
  expect(BrokenLinkSet.empty.parent).toBe(false);
  expect(BrokenLinkSet.empty.links.size).toBe(0);
  expect(BrokenLinkSet.empty.children.size).toBe(0);
  expect(BrokenLinkSet.empty.reverseLinks.size).toBe(0);
});

test("empty は参照するたび同一参照を返す", () => {
  expect(BrokenLinkSet.empty).toBe(BrokenLinkSet.empty);
});

test("isBroken は lookup に存在する参照へ false を返す", () => {
  expect(BrokenLinkSet.isBroken("tasks/a.md", existing())).toBe(false);
});

test("isBroken は lookup に無い参照へ true を返す", () => {
  expect(BrokenLinkSet.isBroken("tasks/missing.md", existing())).toBe(true);
});

test.each([
  { label: "./ prefix", ref: "./tasks/a.md" },
  { label: "backslash 区切り", ref: "tasks\\a.md" },
])("isBroken は表記揺れ ($label) を解決して false を返す", ({ ref }) => {
  expect(BrokenLinkSet.isBroken(ref, existing())).toBe(false);
});

test.each([
  { label: "空文字", ref: "" },
  { label: "POSIX 絶対 path", ref: "/tasks/a.md" },
  { label: "Windows 区切り絶対 path", ref: "\\tasks\\a.md" },
  { label: "Windows drive prefix", ref: "C:/tasks/a.md" },
])("isBroken は正規化できない $label を broken 扱いにする", ({ ref }) => {
  expect(BrokenLinkSet.isBroken(ref, existing())).toBe(true);
});

test("from は lookup 未指定なら empty と同一参照を返す", () => {
  const task = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/missing.md",
  });
  expect(BrokenLinkSet.from(task, undefined)).toBe(BrokenLinkSet.empty);
});

test("from は 4 種の参照を broken / healthy に仕分ける", () => {
  const task = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/missing.md",
    links: ["tasks/a.md", "tasks/gone.md"],
    children: ["tasks/b.md"],
    reverseLinks: ["tasks/nope.md"],
  });
  const result = BrokenLinkSet.from(task, existing());
  expect(result.parent).toBe(true);
  expect(result.links).toEqual(new Set(["tasks/gone.md"]));
  expect(result.children.size).toBe(0);
  expect(result.reverseLinks).toEqual(new Set(["tasks/nope.md"]));
});

test("from は全参照が解決できるタスクへ 4 種とも空を返す", () => {
  const task = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/a.md",
    links: ["tasks/b.md"],
    children: ["tasks/a.md"],
    reverseLinks: ["tasks/b.md"],
  });
  const result = BrokenLinkSet.from(task, existing());
  expect(result.parent).toBe(false);
  expect(result.links.size).toBe(0);
  expect(result.children.size).toBe(0);
  expect(result.reverseLinks.size).toBe(0);
});

test("from は broken な ref を正規化せず raw のまま保持する", () => {
  const task = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    links: ["./tasks/missing.md", "tasks\\dead.md"],
  });
  expect(BrokenLinkSet.from(task, existing()).links).toEqual(
    new Set(["./tasks/missing.md", "tasks\\dead.md"]),
  );
});

test("from は parent が undefined のタスクを broken 扱いしない", () => {
  const task = makeTask({ id: "x", filePath: "tasks/x.md" });
  expect(BrokenLinkSet.from(task, existing()).parent).toBe(false);
});

test.each([
  { label: "parent", refs: { parent: "tasks/missing.md" } },
  { label: "links", refs: { links: ["tasks/missing.md"] } },
  { label: "children", refs: { children: ["tasks/missing.md"] } },
  { label: "reverseLinks", refs: { reverseLinks: ["tasks/missing.md"] } },
])("hasAny は $label の broken を検出する", ({ refs }) => {
  const task = makeTask({ id: "x", filePath: "tasks/x.md", ...refs });
  expect(BrokenLinkSet.hasAny(task, existing())).toBe(true);
});

test("hasAny は全参照が解決できるタスクへ false を返す", () => {
  const task = makeTask({
    id: "x",
    filePath: "tasks/x.md",
    parent: "tasks/a.md",
    links: ["tasks/b.md"],
    children: ["tasks/a.md"],
    reverseLinks: ["tasks/b.md"],
  });
  expect(BrokenLinkSet.hasAny(task, existing())).toBe(false);
});

test("hasAny は参照を一切持たないタスクへ false を返す", () => {
  const task = makeTask({ id: "x", filePath: "tasks/x.md" });
  expect(BrokenLinkSet.hasAny(task, existing())).toBe(false);
});

test("countTasks は broken を持つタスクの件数を返す", () => {
  const tasks = [
    makeTask({ id: "a", filePath: "tasks/a.md" }),
    makeTask({ id: "x", filePath: "tasks/x.md", links: ["tasks/missing.md"] }),
    makeTask({ id: "y", filePath: "tasks/y.md", parent: "tasks/gone.md" }),
  ];
  expect(BrokenLinkSet.countTasks(tasks, existing())).toBe(2);
});

test("countTasks は複数種の broken を持つタスクを 1 と数える", () => {
  const tasks = [
    makeTask({
      id: "x",
      filePath: "tasks/x.md",
      parent: "tasks/gone.md",
      links: ["tasks/missing.md"],
      children: ["tasks/orphan.md"],
      reverseLinks: ["tasks/dead.md"],
    }),
  ];
  expect(BrokenLinkSet.countTasks(tasks, existing())).toBe(1);
});

test("countTasks は空配列へ 0 を返す", () => {
  expect(BrokenLinkSet.countTasks([], existing())).toBe(0);
});
