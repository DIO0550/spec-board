import { afterEach, expect, test } from "vitest";
import { EMPTY_TASK_FILTER } from "@/features/board/lib/applyTaskFilter";
import {
  loadSavedFilters,
  normalizeSavedFilters,
  persistSavedFilter,
  removeSavedFilter,
  SAVED_FILTERS_LIMIT,
  SAVED_FILTERS_STORAGE_KEY,
  type SavedFilter,
} from "@/features/board/lib/savedFilters";

const PROJECT = "/projects/alpha";

const FILTER: SavedFilter = {
  name: "高優先度のバグ",
  criteria: {
    ...EMPTY_TASK_FILTER,
    labels: ["bug"],
    priorities: ["High"],
  },
};

afterEach(() => {
  window.localStorage.clear();
});

test("未保存・壊れた値からは空一覧を返す", () => {
  expect(loadSavedFilters(PROJECT)).toEqual([]);
  window.localStorage.setItem(SAVED_FILTERS_STORAGE_KEY, "{broken json");
  expect(loadSavedFilters(PROJECT)).toEqual([]);
});

test("保存した一覧を同じプロジェクトキーで読み戻せる", () => {
  persistSavedFilter(PROJECT, FILTER);
  expect(loadSavedFilters(PROJECT)).toEqual([FILTER]);
  // 別プロジェクトには漏れない
  expect(loadSavedFilters("/projects/beta")).toEqual([]);
});

test("同名保存は上書きになる", () => {
  persistSavedFilter(PROJECT, FILTER);
  const updated: SavedFilter = {
    name: FILTER.name,
    criteria: { ...EMPTY_TASK_FILTER, statuses: ["Done"] },
  };
  const next = persistSavedFilter(PROJECT, updated);
  expect(next).toEqual([updated]);
  expect(loadSavedFilters(PROJECT)).toEqual([updated]);
});

test("削除で該当エントリだけが消える", () => {
  persistSavedFilter(PROJECT, FILTER);
  persistSavedFilter(PROJECT, {
    name: "別のフィルタ",
    criteria: EMPTY_TASK_FILTER,
  });
  const next = removeSavedFilter(PROJECT, FILTER.name);
  expect(next.map((filter) => filter.name)).toEqual(["別のフィルタ"]);
});

test("上限に達すると新規追加は無視される（同名上書きは可）", () => {
  for (let index = 0; index < SAVED_FILTERS_LIMIT; index += 1) {
    persistSavedFilter(PROJECT, {
      name: `filter-${index}`,
      criteria: EMPTY_TASK_FILTER,
    });
  }
  const rejected = persistSavedFilter(PROJECT, {
    name: "over-limit",
    criteria: EMPTY_TASK_FILTER,
  });
  expect(rejected).toHaveLength(SAVED_FILTERS_LIMIT);
  expect(rejected.some((filter) => filter.name === "over-limit")).toBe(false);
  const overwritten = persistSavedFilter(PROJECT, {
    name: "filter-0",
    criteria: { ...EMPTY_TASK_FILTER, keyword: "updated" },
  });
  expect(overwritten).toHaveLength(SAVED_FILTERS_LIMIT);
});

test.each([
  ["配列でない値", { not: "array" }],
  ["name 欠損", [{ criteria: EMPTY_TASK_FILTER }]],
  ["name 空文字", [{ name: "  ", criteria: EMPTY_TASK_FILTER }]],
])("normalizeSavedFilters は不正エントリを捨てる: %s", (_label, value) => {
  expect(normalizeSavedFilters(value)).toEqual([]);
});

test("normalizeSavedFilters は criteria の欠損・不正フィールドを既定値へ倒す", () => {
  const normalized = normalizeSavedFilters([
    {
      name: "lenient",
      criteria: {
        keyword: 123,
        labels: ["bug", 42],
        priorities: ["High", "urgent"],
        statuses: "Todo",
        milestone: "broken",
      },
    },
  ]);
  expect(normalized).toEqual([
    {
      name: "lenient",
      criteria: {
        ...EMPTY_TASK_FILTER,
        labels: ["bug"],
        priorities: ["High"],
      },
    },
  ]);
});

test("同名エントリは先勝ちで重複排除される", () => {
  const normalized = normalizeSavedFilters([
    { name: "dup", criteria: { ...EMPTY_TASK_FILTER, keyword: "first" } },
    { name: "dup", criteria: { ...EMPTY_TASK_FILTER, keyword: "second" } },
  ]);
  expect(normalized).toHaveLength(1);
  expect(normalized[0]?.criteria.keyword).toBe("first");
});
