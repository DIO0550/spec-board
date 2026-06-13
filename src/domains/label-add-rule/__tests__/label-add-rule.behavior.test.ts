import { expect, test } from "vitest";
import { LabelAddRule } from "..";

test('classify([], "x") は added で value="x"', () => {
  expect(LabelAddRule.classify([], "x")).toEqual({ kind: "added", value: "x" });
});

test('classify(["a"], "  b  ") は trim して added で value="b"', () => {
  expect(LabelAddRule.classify(["a"], "  b  ")).toEqual({
    kind: "added",
    value: "b",
  });
});

test.each([
  { input: "", label: "空文字" },
  { input: "   ", label: "空白のみ" },
])("classify(current, $label) は empty", ({ input }) => {
  expect(LabelAddRule.classify(["a"], input)).toEqual({ kind: "empty" });
});

test('classify(["a"], "a") は duplicate で value="a"', () => {
  expect(LabelAddRule.classify(["a"], "a")).toEqual({
    kind: "duplicate",
    value: "a",
  });
});

test('classify(["b"], "  b  ") は trim 後一致で duplicate', () => {
  expect(LabelAddRule.classify(["b"], "  b  ")).toEqual({
    kind: "duplicate",
    value: "b",
  });
});
