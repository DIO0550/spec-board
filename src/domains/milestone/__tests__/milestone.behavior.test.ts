import { expect, test } from "vitest";
import type { MilestoneDefinition } from "@/lib/tauri";
import { Milestone } from "../index";

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
