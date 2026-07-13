import { expect, test } from "vitest";
import { LabelSelection } from "..";

// --- search: 候補絞り込み（case-insensitive・部分一致・空 query は全件） ---

test("search: 空 query は候補を全件返す", () => {
  expect(LabelSelection.search(["a", "b"], "")).toEqual(["a", "b"]);
});

test("search: 部分一致は大文字小文字を無視する", () => {
  expect(LabelSelection.search(["Bug", "Feature"], "ug")).toEqual(["Bug"]);
});

test("search: 前後空白のある query は trim して照合する", () => {
  expect(LabelSelection.search(["Bug", "Feature"], "  bug ")).toEqual(["Bug"]);
});

test("search: 該当なしは空配列", () => {
  expect(LabelSelection.search(["a"], "z")).toEqual([]);
});

test("search: 空候補配列は空配列", () => {
  expect(LabelSelection.search([], "x")).toEqual([]);
});

// --- canCreate: 新規作成可否（case-insensitive） ---

test("canCreate: 候補にも選択済みにも無い新規名は true", () => {
  expect(LabelSelection.canCreate([], ["a"], "new")).toBe(true);
});

test("canCreate: 候補に大文字小文字違いで存在すれば false", () => {
  expect(LabelSelection.canCreate([], ["Bug"], "bug")).toBe(false);
});

test("canCreate: 選択済みに大文字小文字違いで存在すれば false", () => {
  expect(LabelSelection.canCreate(["Bug"], [], "bug")).toBe(false);
});

test.each([
  { query: "", label: "空文字" },
  { query: "  ", label: "空白のみ" },
])("canCreate: query が $label なら false", ({ query }) => {
  expect(LabelSelection.canCreate([], ["a"], query)).toBe(false);
});

test("canCreate: 空候補配列でも新規名なら true（候補未取得フォールバック相当）", () => {
  expect(LabelSelection.canCreate([], [], "x")).toBe(true);
});

// --- isSelected: 選択判定（case-insensitive） ---

test("isSelected: 完全一致は true", () => {
  expect(LabelSelection.isSelected(["Bug"], "Bug")).toBe(true);
});

test("isSelected: 大文字小文字違いでも true", () => {
  expect(LabelSelection.isSelected(["bug"], "Bug")).toBe(true);
});

test("isSelected: 未選択は false", () => {
  expect(LabelSelection.isSelected(["Bug"], "Feature")).toBe(false);
});

// --- toggle: 選択トグル（case-insensitive・case 重複を作らない） ---

test("toggle: 未選択の名前を末尾に追加する", () => {
  expect(LabelSelection.toggle(["a"], "b")).toEqual(["a", "b"]);
});

test("toggle: 完全一致する選択済みを除外する", () => {
  expect(LabelSelection.toggle(["a", "b"], "b")).toEqual(["a"]);
});

test("toggle: 大文字小文字違いの選択済みを除外し case 重複を作らない", () => {
  expect(LabelSelection.toggle(["bug"], "Bug")).toEqual([]);
});
