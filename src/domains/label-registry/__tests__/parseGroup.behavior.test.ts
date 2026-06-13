import { expect, test } from "vitest";
import { LabelRegistry } from "..";

test('parseGroup("type:feature") は "type" を返す', () => {
  expect(LabelRegistry.parseGroup("type:feature")).toBe("type");
});

test.each([
  ["type:feature", "type"],
  ["priority:high", "priority"],
  ["area:backend", "area"],
  ["status:done", "status"],
])("parseGroup(%j) は標準グループ %j を返す", (input, expected) => {
  expect(LabelRegistry.parseGroup(input)).toBe(expected);
});

test('parseGroup("scope:fe") はその他 prefix "scope" を返す', () => {
  expect(LabelRegistry.parseGroup("scope:fe")).toBe("scope");
});

test('parseGroup は同グループ別値（priority:high / priority:low）を同じ "priority" に正規化する', () => {
  expect(LabelRegistry.parseGroup("priority:high")).toBe("priority");
  expect(LabelRegistry.parseGroup("priority:low")).toBe("priority");
});

test('parseGroup("Type:Feature") は大小文字を正規化して "type" を返す', () => {
  expect(LabelRegistry.parseGroup("Type:Feature")).toBe("type");
});

test('parseGroup("a:b:c") は最初の ":" まで "a" を返す', () => {
  expect(LabelRegistry.parseGroup("a:b:c")).toBe("a");
});

test.each([
  ["bug", "prefix 無し"],
  ["", "空文字"],
  ["   ", "空白のみ"],
  [":foo", "先頭コロン（prefix が空）"],
  [" :foo", "空白 + 先頭コロン"],
])('parseGroup(%j) は "default" を返す（%s）', (input) => {
  expect(LabelRegistry.parseGroup(input)).toBe("default");
});

test('parseGroup("type :feature") は prefix を trim して "type" を返す', () => {
  expect(LabelRegistry.parseGroup("type :feature")).toBe("type");
});

test('parseGroup("  type:feature") は全体 trim 後に "type" を返す', () => {
  expect(LabelRegistry.parseGroup("  type:feature")).toBe("type");
});

test.each([
  ["type:"],
  ["type:   "],
])('parseGroup(%j) は value 側を無視して prefix のみで判定し "type" を返す', (input) => {
  expect(LabelRegistry.parseGroup(input)).toBe("type");
});
