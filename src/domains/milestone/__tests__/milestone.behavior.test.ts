import { expect, test } from "vitest";
import { Milestone, type MilestoneDefinition } from "..";

test.each([
  ["closed", "closed"],
  ["open", "open"],
  [undefined, "open"],
  ["frozen", "open"],
])("parseState(%s) は %s を返す", (raw, expected) => {
  expect(Milestone.parseState(raw)).toBe(expected);
});

test.each([
  [0, true],
  [4_294_967_295, true],
  [4_294_967_296, false],
  [-1, false],
  [1.5, false],
  [Number.NaN, false],
  [Number.POSITIVE_INFINITY, false],
  [Number.NEGATIVE_INFINITY, false],
])("isValidOrder(%s) は %s を返す", (order, expected) => {
  expect(Milestone.isValidOrder(order)).toBe(expected);
});

test("badgeLabel は title があれば title を優先する", () => {
  const def: MilestoneDefinition = { name: "v0.3", title: "v0.3 リリース" };
  expect(Milestone.badgeLabel("v0.3", def)).toBe("v0.3 リリース");
});

test("badgeLabel は definition が undefined のとき name を返す", () => {
  expect(Milestone.badgeLabel("v0.3", undefined)).toBe("v0.3");
});

test("badgeLabel は title が空文字のとき name を返す", () => {
  const def: MilestoneDefinition = { name: "v0.3", title: "" };
  expect(Milestone.badgeLabel("v0.3", def)).toBe("v0.3");
});

test("dueLabel は definition の due を返す", () => {
  const def: MilestoneDefinition = { name: "v0.3", due: "2026-07-31" };
  expect(Milestone.dueLabel(def)).toBe("2026-07-31");
});

test("byName は name キーの Map を作る", () => {
  const milestones: MilestoneDefinition[] = [
    { name: "v0.3" },
    { name: "v0.4" },
  ];
  const map = Milestone.byName(milestones);
  expect(map.get("v0.3")).toEqual({ name: "v0.3" });
  expect(map.size).toBe(2);
});

test("sortByOrder は order 昇順に並べ替える", () => {
  const milestones: MilestoneDefinition[] = [
    { name: "b", order: 2 },
    { name: "a", order: 1 },
    { name: "c", order: 3 },
  ];
  expect(Milestone.sortByOrder(milestones).map((m) => m.name)).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("sortByOrder は order 未指定を末尾に置く", () => {
  const milestones: MilestoneDefinition[] = [
    { name: "noOrder" },
    { name: "ordered", order: 1 },
  ];
  expect(Milestone.sortByOrder(milestones).map((m) => m.name)).toEqual([
    "ordered",
    "noOrder",
  ]);
});

test("sortByOrder は order 同値のとき定義順を保つ（安定）", () => {
  const milestones: MilestoneDefinition[] = [
    { name: "x", order: 1 },
    { name: "y", order: 1 },
  ];
  expect(Milestone.sortByOrder(milestones).map((m) => m.name)).toEqual([
    "x",
    "y",
  ]);
});

test("sortByOrder は order 全件未指定のとき定義順を保つ（安定）", () => {
  const milestones: MilestoneDefinition[] = [
    { name: "p" },
    { name: "q" },
    { name: "r" },
  ];
  expect(Milestone.sortByOrder(milestones).map((m) => m.name)).toEqual([
    "p",
    "q",
    "r",
  ]);
});
