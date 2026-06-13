import { expect, test } from "vitest";
import { Task } from "@/types/task";
import { Milestone, type MilestoneDefinition } from "../index";

test.each([
  ["closed", "closed"],
  ["open", "open"],
  [undefined, "open"],
  ["frozen", "open"],
])("parseState(%s) は %s を返す", (raw, expected) => {
  expect(Milestone.parseState(raw)).toBe(expected);
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

const taskWithMilestone = (id: string, milestone: string | undefined): Task =>
  Task.fromPayload({
    id,
    title: id,
    status: "Todo",
    milestone,
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `tasks/${id}.md`,
  });

test("usageCounts は milestone ごとの使用数を数える", () => {
  const tasks = [
    taskWithMilestone("a", "v0.3"),
    taskWithMilestone("b", "v0.3"),
    taskWithMilestone("c", "v0.4"),
  ];
  expect(Milestone.usageCounts(tasks)).toEqual({ "v0.3": 2, "v0.4": 1 });
});

test("usageCounts は未設定（undefined / 空文字）のタスクを数えない", () => {
  const tasks = [
    taskWithMilestone("a", undefined),
    taskWithMilestone("b", ""),
    taskWithMilestone("c", "v0.3"),
  ];
  expect(Milestone.usageCounts(tasks)).toEqual({ "v0.3": 1 });
});

test("usageCounts はタスク 0 件で空オブジェクトを返す", () => {
  expect(Milestone.usageCounts([])).toEqual({});
});
