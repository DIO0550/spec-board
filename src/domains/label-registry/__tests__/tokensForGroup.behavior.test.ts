import { expect, test } from "vitest";
import { type ColorTokens, LabelRegistry } from "../index";

const OKLCH_PATTERN = /^oklch\(/;

test('tokensForGroup("type") は palette index 1 の ColorTokens を返す', () => {
  expect(LabelRegistry.tokensForGroup("type")).toBe(LabelRegistry.PALETTE[1]);
});

test('tokensForGroup("default") は palette index 0 の ColorTokens を返す', () => {
  expect(LabelRegistry.tokensForGroup("default")).toBe(
    LabelRegistry.PALETTE[0],
  );
});

test.each([
  ["default", 0],
  ["type", 1],
  ["priority", 2],
  ["area", 3],
  ["status", 4],
])("tokensForGroup(%j) は固定枠 index %d を返す", (group, index) => {
  expect(LabelRegistry.tokensForGroup(group)).toBe(
    LabelRegistry.PALETTE[index],
  );
});

test('tokensForLabel("priority:high") は tokensForGroup("priority") と同一参照を返す', () => {
  expect(LabelRegistry.tokensForLabel("priority:high")).toBe(
    LabelRegistry.tokensForGroup("priority"),
  );
});

test("1 グループ 1 色: priority:high と priority:low は同一 ColorTokens", () => {
  expect(LabelRegistry.tokensForLabel("priority:high")).toBe(
    LabelRegistry.tokensForLabel("priority:low"),
  );
});

test.each(
  LabelRegistry.PALETTE.map((tokens, i) => [i, tokens] as const),
)("palette index %d は fg/bg/bd/dot が揃い oklch 文字列である", (_index, tokens: ColorTokens) => {
  expect(tokens.fg).toMatch(OKLCH_PATTERN);
  expect(tokens.bg).toMatch(OKLCH_PATTERN);
  expect(tokens.bd).toMatch(OKLCH_PATTERN);
  expect(tokens.dot).toMatch(OKLCH_PATTERN);
});

test("決定性: 同一その他 prefix を 2 回解決すると同一参照", () => {
  expect(LabelRegistry.tokensForGroup("scope")).toBe(
    LabelRegistry.tokensForGroup("scope"),
  );
});

test('その他 prefix "scope" は動的枠 index 5..9 に決定的に写像される', () => {
  const tokens = LabelRegistry.tokensForGroup("scope");
  const index = LabelRegistry.PALETTE.indexOf(tokens);
  expect(index).toBeGreaterThanOrEqual(5);
  expect(index).toBeLessThanOrEqual(9);
});

test("固定枠との排他性: 多数のその他 prefix はすべて動的枠 index 5..9 に入る", () => {
  const others = [
    "scope",
    "kind",
    "team",
    "module",
    "phase",
    "owner",
    "size",
    "epic",
  ];
  for (const group of others) {
    const index = LabelRegistry.PALETTE.indexOf(
      LabelRegistry.tokensForGroup(group),
    );
    expect(index).toBeGreaterThanOrEqual(5);
    expect(index).toBeLessThanOrEqual(9);
  }
});

test("既知 prefix の解決 index を golden 値で固定する（ハッシュ実装変更の回帰検知）", () => {
  // hash=(hash*31+charCodeAt(i))|0、Math.abs % 5、+5 オフセット
  // "scope": s=115,c=99,o=111,p=112,e=101
  //   h=115 → 115*31+99=3664 → 3664*31+111=113695 → 113695*31+112=3524657
  //     → 3524657*31+101=109264468 → abs%5=3 → +5 = 8
  expect(
    LabelRegistry.PALETTE.indexOf(LabelRegistry.tokensForGroup("scope")),
  ).toBe(8);
  // "kind": k=107,i=105,n=110,d=100
  //   h=107 → 107*31+105=3422 → 3422*31+110=106192 → 106192*31+100=3292052
  //     → abs%5=2 → +5 = 7
  expect(
    LabelRegistry.PALETTE.indexOf(LabelRegistry.tokensForGroup("kind")),
  ).toBe(7);
});

test.each([
  ["Type", 1],
  [" type ", 1],
])("tokensForGroup(%j) は未正規化でも type 群 index %d に一致", (group, index) => {
  expect(LabelRegistry.tokensForGroup(group)).toBe(
    LabelRegistry.PALETTE[index],
  );
});

test.each([
  [""],
  ["   "],
])("tokensForGroup(%j) は default 群 index 0 を返し動的枠に落ちない", (group) => {
  expect(LabelRegistry.tokensForGroup(group)).toBe(LabelRegistry.PALETTE[0]);
});
