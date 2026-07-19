import { expect, test } from "vitest";
import { LabelDefinition } from "@/domains/label-definition";
import {
  filterLabels,
  type LabelGroupFilter,
  type LabelSort,
  labelColorTally,
  labelGroupCounts,
  labelStats,
  sortLabels,
} from "@/features/settings/lib/labelSettings/derive";

const labels = LabelDefinition.listFromWire([
  {
    name: "bug",
    description: "バグ報告",
    group: "type",
    color: "#d55753",
    updated: "2026-06-16T11:58:00Z",
  },
  {
    name: "frontend",
    description: "UI / クライアントサイド",
    group: "area",
    updated: "2026-06-16T11:58:00Z",
  },
  {
    name: "a11y",
    description: "アクセシビリティ関連",
    group: "area",
    updated: "2026-06-11T12:00:00Z",
  },
  {
    name: "wontfix",
    description: "対応しない判断",
    group: "status",
    updated: "2026-05-16T12:00:00Z",
  },
]);

const allFilter: LabelGroupFilter = { kind: "all" };

test("filterLabels: キーワードは name の部分一致で大小無視", () => {
  expect(filterLabels(labels, "BUG", allFilter).map((l) => l.name)).toEqual([
    "bug",
  ]);
});

test("filterLabels: キーワードは description にも適用される", () => {
  expect(
    filterLabels(labels, "アクセシビリティ", allFilter).map((l) => l.name),
  ).toEqual(["a11y"]);
});

test("filterLabels: kind=all はキーワードのみ適用", () => {
  expect(filterLabels(labels, "", allFilter)).toHaveLength(4);
});

test("filterLabels: kind=group は実グループ名で絞る", () => {
  const result = filterLabels(labels, "", { kind: "group", value: "area" });
  expect(result.map((l) => l.name)).toEqual(["frontend", "a11y"]);
});

test("filterLabels: group + keyword の併用は AND", () => {
  const result = filterLabels(labels, "front", {
    kind: "group",
    value: "area",
  });
  expect(result.map((l) => l.name)).toEqual(["frontend"]);
});

test("filterLabels: kind=group で 'all' を指定しても群名と衝突しない", () => {
  const withAllGroup = LabelDefinition.listFromWire([
    { name: "anything", group: "all" },
  ]);
  expect(
    filterLabels(withAllGroup, "", { kind: "group", value: "all" }).map(
      (l) => l.name,
    ),
  ).toEqual(["anything"]);
  expect(
    filterLabels(withAllGroup, "", { kind: "all" }).map((l) => l.name),
  ).toEqual(["anything"]);
});

test("filterLabels: マッチ無しで空配列", () => {
  expect(filterLabels(labels, "zzzz", allFilter)).toEqual([]);
});

const usageCounts: Record<string, number> = {
  bug: 8,
  frontend: 9,
  a11y: 2,
  wontfix: 0,
};

test.each<[LabelSort, string[]]>([
  ["name", ["a11y", "bug", "frontend", "wontfix"]],
  ["usage", ["frontend", "bug", "a11y", "wontfix"]],
  ["updated", ["bug", "frontend", "a11y", "wontfix"]],
])("sortLabels(%s) は期待順に並べる", (sort, expected) => {
  expect(sortLabels(labels, sort, usageCounts).map((l) => l.name)).toEqual(
    expected,
  );
});

test("sortLabels: updated 無しは末尾へ送る（安定）", () => {
  const withMissing = LabelDefinition.listFromWire([
    { name: "noupdated" },
    { name: "newest", updated: "2026-06-16T11:58:00Z" },
    { name: "older", updated: "2026-06-15T11:58:00Z" },
  ]);
  expect(sortLabels(withMissing, "updated", {}).map((l) => l.name)).toEqual([
    "newest",
    "older",
    "noupdated",
  ]);
});

test("labelStats: total/used/unused を返す", () => {
  expect(labelStats(labels, usageCounts)).toEqual({
    total: 4,
    used: 3,
    unused: 1,
  });
});

test("labelStats: usageCounts に未定義キーは未使用扱い", () => {
  expect(labelStats(labels, { bug: 8 })).toEqual({
    total: 4,
    used: 1,
    unused: 3,
  });
});

test("labelGroupCounts: all + グループ別件数（group 無しは default）", () => {
  const mixed = LabelDefinition.listFromWire([
    { name: "x", group: "type" },
    { name: "y", group: "type" },
    { name: "z", group: "area" },
    { name: "n" },
  ]);
  expect(labelGroupCounts(mixed)).toEqual({
    all: 4,
    groups: [
      { group: "type", count: 2 },
      { group: "area", count: 1 },
      { group: "default", count: 1 },
    ],
  });
});

test("labelColorTally: 使用中ラベルのみ・色キー（color or group）で集計", () => {
  const tally = labelColorTally(labels, usageCounts);
  // bug は color 指定（#d55753）、frontend/a11y は area group、wontfix は使用 0 で除外
  const map = Object.fromEntries(tally.map((e) => [e.color, e.count]));
  expect(map["#d55753"]).toBe(1);
  expect(map.area).toBe(2);
  expect(tally.find((e) => e.color === "wontfix")).toBeUndefined();
});

test("labelGroupCounts: __proto__ / constructor のような group 名でも継承プロパティと衝突せず数える", () => {
  const labels = LabelDefinition.listFromWire([
    { name: "a", group: "__proto__" },
    { name: "b", group: "__proto__" },
    { name: "c", group: "constructor" },
  ]);
  const result = labelGroupCounts(labels);
  expect(result.all).toBe(3);
  expect(result.groups).toContainEqual({ group: "__proto__", count: 2 });
  expect(result.groups).toContainEqual({ group: "constructor", count: 1 });
});

test("labelColorTally: __proto__ / constructor の group fallback でも継承プロパティと衝突せず数える", () => {
  const labels = LabelDefinition.listFromWire([
    { name: "a", group: "__proto__" },
    { name: "b", group: "__proto__" },
    { name: "c", group: "constructor" },
  ]);
  const usageCounts: Record<string, number> = { a: 1, b: 1, c: 1 };
  const tally = labelColorTally(labels, usageCounts);
  expect(tally).toContainEqual({ color: "__proto__", count: 2 });
  expect(tally).toContainEqual({ color: "constructor", count: 1 });
});
