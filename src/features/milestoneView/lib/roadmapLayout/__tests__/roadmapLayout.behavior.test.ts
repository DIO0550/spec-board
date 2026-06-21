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

test("月境界の due はパーセント上も整数 N か月境界に整合する（年月インデックス基準）", () => {
  // 起点 2026-06 から見て 2026-08-01 はちょうど 2 か月後 = 25% の境界
  // dueOffset=2 / startOffset=0 / endOffset=3 → left=0% / right=37.5%
  const layout = computeRoadmapLayout([def("aug-1st", "2026-08-01")], NOW);
  const row = layout.rows[0];
  expect(row.leftPercent).toBeCloseTo(0, 5);
  expect(row.widthPercent).toBeCloseTo(37.5, 5);
});

test("月末と次月初は連続して並ぶ（旧 30.4375 近似ではズレていた）", () => {
  const layout = computeRoadmapLayout(
    [def("end-jul", "2026-07-31"), def("aug-1st", "2026-08-01")],
    NOW,
  );
  const [endJul, aug1] = layout.rows;
  // 旧実装 (DAYS_PER_MONTH=30.4375) では 1 か月分以上ズレていたケース。
  // 新実装では 1/31 か月 / 8 * 100 ≈ 0.4% 程度に収まる。安全側に 1% 未満を確認。
  const diff = Math.abs(aug1.leftPercent - endJul.leftPercent);
  expect(diff).toBeLessThan(1);
});
