import { expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { addMonth, bucketTasksByDue, buildMonthGrid } from "..";

const buildTask = (overrides: Partial<TaskPayload>): Task => {
  return Task.fromPayload({
    id: overrides.id ?? "id",
    title: overrides.title ?? "タイトル",
    status: overrides.status ?? "Todo",
    due: overrides.due,
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: overrides.filePath ?? "tasks/a.md",
  });
};

test("月グリッドは各週 7 セルで構成される", () => {
  const weeks = buildMonthGrid(2026, 6);
  expect(weeks.every((week) => week.length === 7)).toBe(true);
});

test("月グリッドは当月の全日付を昇順で含む", () => {
  const weeks = buildMonthGrid(2026, 6);
  const days = weeks.flat().filter((cell): cell is string => cell !== null);
  expect(days).toHaveLength(30);
  expect(days[0]).toBe("2026-06-01");
  expect(days[29]).toBe("2026-06-30");
});

test("月初の曜日までは先頭セルが null で詰められる", () => {
  const weeks = buildMonthGrid(2026, 6);
  const firstWeekday = new Date(2026, 5, 1).getDay();
  const leadingNulls = weeks[0].slice(0, firstWeekday);
  expect(leadingNulls.every((cell) => cell === null)).toBe(true);
  expect(weeks[0][firstWeekday]).toBe("2026-06-01");
});

test("有効な期限のタスクは日付ごとにまとまる", () => {
  const result = bucketTasksByDue([
    buildTask({ id: "a", due: "2026-06-10" }),
    buildTask({ id: "b", due: "2026-06-10" }),
    buildTask({ id: "c", due: "2026-06-11" }),
  ]);
  expect(result.byDate.get("2026-06-10")?.map((task) => task.id)).toEqual([
    "a",
    "b",
  ]);
  expect(result.byDate.get("2026-06-11")?.map((task) => task.id)).toEqual([
    "c",
  ]);
});

test.each([
  ["期限なし", undefined],
  ["不正な期限", "not-a-date"],
])("%s のタスクは undated に振り分けられる", (_label, due) => {
  const result = bucketTasksByDue([buildTask({ id: "x", due })]);
  expect(result.undated.map((task) => task.id)).toEqual(["x"]);
  expect(result.byDate.size).toBe(0);
});

test.each([
  ["12月 +1 で翌年1月", { year: 2026, month: 12 }, 1, { year: 2027, month: 1 }],
  [
    "1月 -1 で前年12月",
    { year: 2026, month: 1 },
    -1,
    { year: 2025, month: 12 },
  ],
  ["6月 +3 で9月", { year: 2026, month: 6 }, 3, { year: 2026, month: 9 }],
] as const)("%s", (_label, current, delta, expected) => {
  expect(addMonth(current, delta)).toEqual(expected);
});
