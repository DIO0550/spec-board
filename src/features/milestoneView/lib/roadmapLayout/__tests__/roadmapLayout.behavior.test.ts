import { expect, test } from "vitest";
import type { MilestoneDefinition } from "@/domains/milestone";
import { computeRoadmapLayout } from "@/features/milestoneView/lib/roadmapLayout";

const NOW = new Date(2026, 5, 21); // 2026-06-21

const def = (name: string, due?: string): MilestoneDefinition => ({
  name,
  due,
  state: "open",
});

test("due 未設定のマイルストーンは rows から除外される", () => {
  const layout = computeRoadmapLayout([def("no-due")], NOW);
  expect(layout.rows).toHaveLength(0);
});

test("monthLabels は今月起点で 8 件", () => {
  const layout = computeRoadmapLayout([], NOW);
  expect(layout.monthLabels).toHaveLength(8);
  expect(layout.monthLabels[0]).toBe("2026-06");
  expect(layout.monthLabels[7]).toBe("2027-01");
});

test("today マーカーは月の進行に応じて 0..100 のパーセントに収まる", () => {
  const layout = computeRoadmapLayout([], NOW);
  expect(layout.todayPercent).toBeGreaterThan(0);
  expect(layout.todayPercent).toBeLessThan(100);
});

test("バーの left + width は常に 100% を超えない（未来側はみ出し）", () => {
  // due が表示範囲を大きく超える（+10 か月後）
  const layout = computeRoadmapLayout([def("future", "2027-04-30")], NOW);
  const row = layout.rows[0];
  expect(row).toBeDefined();
  expect(row.leftPercent + row.widthPercent).toBeLessThanOrEqual(100);
  expect(row.clipped).toBe(true);
});

test("バーの left + width は常に 100% を超えない（過去側はみ出し）", () => {
  const layout = computeRoadmapLayout([def("past", "2026-05-01")], NOW);
  const row = layout.rows[0];
  expect(row).toBeDefined();
  expect(row.leftPercent).toBeGreaterThanOrEqual(0);
  expect(row.leftPercent + row.widthPercent).toBeLessThanOrEqual(100);
  expect(row.clipped).toBe(true);
});

test("範囲内に収まる due は clipped=false", () => {
  const layout = computeRoadmapLayout([def("inside", "2026-08-15")], NOW);
  const row = layout.rows[0];
  expect(row.clipped).toBe(false);
});

test("バー幅は常に最小幅 (1 か月分) 以上ある", () => {
  const layout = computeRoadmapLayout([def("future", "2027-04-30")], NOW);
  const row = layout.rows[0];
  const minWidth = (1 / 8) * 100;
  expect(row.widthPercent).toBeGreaterThanOrEqual(minWidth);
});
