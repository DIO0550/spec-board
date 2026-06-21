import { expect, test } from "vitest";
import type { MilestoneDefinition } from "@/domains/milestone";
import type { MilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import {
  filterMilestones,
  groupByDisplayStatus,
  sortMilestones,
} from "@/features/milestoneView/lib/listOps";

const NOW = new Date(2026, 5, 21);

const def = (
  name: string,
  state: "open" | "closed",
  due?: string,
  title?: string,
): MilestoneDefinition => ({
  name,
  state,
  due,
  title,
});

test("filterMilestones: all は全件返す（クエリ未指定）", () => {
  const list = [def("a", "open"), def("b", "closed")];
  const res = filterMilestones(list, { state: "all", query: "" }, NOW);
  expect(res.map((m) => m.name)).toEqual(["a", "b"]);
});

test("filterMilestones: state=open は open のみ", () => {
  const list = [def("a", "open"), def("b", "closed")];
  const res = filterMilestones(list, { state: "open", query: "" }, NOW);
  expect(res.map((m) => m.name)).toEqual(["a"]);
});

test("filterMilestones: state=closed は closed のみ", () => {
  const list = [def("a", "open"), def("b", "closed")];
  const res = filterMilestones(list, { state: "closed", query: "" }, NOW);
  expect(res.map((m) => m.name)).toEqual(["b"]);
});

test("filterMilestones: state=overdue は open かつ期日超過のみ", () => {
  const list = [
    def("past-open", "open", "2026-06-20"),
    def("past-closed", "closed", "2026-06-20"),
    def("future-open", "open", "2026-12-31"),
  ];
  const res = filterMilestones(list, { state: "overdue", query: "" }, NOW);
  expect(res.map((m) => m.name)).toEqual(["past-open"]);
});

test("filterMilestones: query は title / name の部分一致（大文字小文字不問）", () => {
  const list = [
    def("v0.1", "open", undefined, "通知センター"),
    def("v0.2", "open", undefined, "検索"),
    def("v0.3", "open"),
  ];
  const res = filterMilestones(list, { state: "all", query: "通知" }, NOW);
  expect(res.map((m) => m.name)).toEqual(["v0.1"]);
});

test("sortMilestones: by-due は早い順、due 未設定は末尾", () => {
  const list = [
    def("c", "open"),
    def("a", "open", "2026-01-01"),
    def("b", "open", "2026-06-01"),
  ];
  const res = sortMilestones(list, "due", new Map());
  expect(res.map((m) => m.name)).toEqual(["a", "b", "c"]);
});

test("sortMilestones: by-due で due 未設定が複数あっても元の順序を保つ（NaN 比較によるソート崩れ回避）", () => {
  const list = [
    def("first", "open"),
    def("second", "open"),
    def("third", "open"),
  ];
  const res = sortMilestones(list, "due", new Map());
  expect(res.map((m) => m.name)).toEqual(["first", "second", "third"]);
});

test("sortMilestones: by-progress で ratio 未定義が複数あっても元の順序を保つ（NaN 比較によるソート崩れ回避）", () => {
  const list = [def("a", "open"), def("b", "open"), def("c", "open")];
  const res = sortMilestones(list, "progress", new Map());
  expect(res.map((m) => m.name)).toEqual(["a", "b", "c"]);
});

test("sortMilestones: by-name は name 昇順", () => {
  const list = [def("c", "open"), def("a", "open"), def("b", "open")];
  const res = sortMilestones(list, "name", new Map());
  expect(res.map((m) => m.name)).toEqual(["a", "b", "c"]);
});

test("sortMilestones: by-progress は ratio 降順、ratio 未定義は末尾", () => {
  const list = [def("low", "open"), def("high", "open"), def("none", "open")];
  const progress = new Map<string, MilestoneProgress>([
    ["low", { total: 4, done: 1, ratio: 0.25 }],
    ["high", { total: 4, done: 3, ratio: 0.75 }],
    ["none", { total: 0, done: 0, ratio: undefined }],
  ]);
  const res = sortMilestones(list, "progress", progress);
  expect(res.map((m) => m.name)).toEqual(["high", "low", "none"]);
});

test("groupByDisplayStatus: open / closed / overdue に分割", () => {
  const list = [
    def("o", "open", "2026-12-31"),
    def("c", "closed"),
    def("p", "open", "2026-06-20"),
  ];
  const res = groupByDisplayStatus(list, NOW);
  expect(res.open.map((m) => m.name)).toEqual(["o"]);
  expect(res.closed.map((m) => m.name)).toEqual(["c"]);
  expect(res.overdue.map((m) => m.name)).toEqual(["p"]);
});
