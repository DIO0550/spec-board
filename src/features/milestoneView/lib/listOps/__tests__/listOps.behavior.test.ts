import { expect, test } from "vitest";
import type { MilestoneDefinition } from "@/domains/milestone";
import type { MilestoneProjection } from "@/domains/milestone-projection";
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

test("filterMilestones: state=open は期限超過 (overdue) を含まない（期限超過は専用フィルタで分離）", () => {
  const list = [
    def("active", "open", "2026-12-31"),
    def("past", "open", "2026-06-20"),
  ];
  const res = filterMilestones(list, { state: "open", query: "" }, NOW);
  expect(res.map((m) => m.name)).toEqual(["active"]);
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

test("sortMilestones: by-order は入力順を保持する（既定順序を尊重）", () => {
  const list = [
    def("c", "open", "2026-12-31"),
    def("a", "open", "2026-01-01"),
    def("b", "open", "2026-06-01"),
  ];
  // due が古い順に並べ替えるのが普通だが、order なら入力順を保つ
  const res = sortMilestones(list, "order", new Map());
  expect(res.map((m) => m.name)).toEqual(["c", "a", "b"]);
});

test("sortMilestones: by-name は name 昇順", () => {
  const list = [def("c", "open"), def("a", "open"), def("b", "open")];
  const res = sortMilestones(list, "name", new Map());
  expect(res.map((m) => m.name)).toEqual(["a", "b", "c"]);
});

test("sortMilestones: by-progress は ratio 降順、ratio 未定義は末尾", () => {
  const list = [def("low", "open"), def("high", "open"), def("none", "open")];
  const progress = new Map<string, MilestoneProjection>([
    ["low", { total: 4, done: 1, taskFilePaths: [] }],
    ["high", { total: 4, done: 3, taskFilePaths: [] }],
    ["none", { total: 0, done: 0, taskFilePaths: [] }],
  ]);
  const res = sortMilestones(list, "progress", progress);
  expect(res.map((m) => m.name)).toEqual(["high", "low", "none"]);
});

test("sortMilestones: ratioを表示できないときは使用件数にかかわらず元の順序を保つ", () => {
  const list = [def("unused", "open"), def("active", "open")];
  const progress = new Map<string, MilestoneProjection>([
    ["active", { total: 2, done: 0, taskFilePaths: [] }],
  ]);

  const res = sortMilestones(list, "progress", progress, false);

  expect(res.map((m) => m.name)).toEqual(["unused", "active"]);
});

test("sortMilestones: 特殊名を Map から安全に引き、同率は入力順を保つ", () => {
  const list = [
    def("constructor", "open"),
    def("__proto__", "open"),
    def("toString", "open"),
  ];
  const progress = new Map<string, MilestoneProjection>([
    ["constructor", { total: 2, done: 1, taskFilePaths: [] }],
    ["__proto__", { total: 2, done: 2, taskFilePaths: [] }],
    ["toString", { total: 4, done: 2, taskFilePaths: [] }],
  ]);

  expect(sortMilestones(list, "progress", progress).map((m) => m.name)).toEqual(
    ["__proto__", "constructor", "toString"],
  );
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
