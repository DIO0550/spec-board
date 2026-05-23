import { expect, test } from "vitest";
import { KebabCase } from "..";

test("ASCII 基本ケース", () => {
  const cases: Array<[string, string, string]> = [
    ["Fix Login Bug", "fix-login-bug", "general ascii"],
    ["FOO", "foo", "uppercase only"],
    ["foo--bar", "foo-bar", "consecutive hyphens collapse"],
    ["  Fix login!! bug  ", "fix-login-bug", "trim and collapse symbols"],
    ["Hello_World.md", "hello-world-md", "underscore and dot are separators"],
  ];
  for (const [input, expected, label] of cases) {
    expect(KebabCase.from(input), label).toBe(expected);
  }
});

test("非 ASCII / mixed ケース", () => {
  const cases: Array<[string, string, string]> = [
    ["タスク 1", "タスク-1", "mixed: cjk + ascii"],
    ["Fix バグ", "fix-バグ", "mixed: ascii first + cjk"],
    ["日本語 title", "日本語-title", "mixed: cjk + ascii word"],
    ["バグ修正", "バグ修正", "all non-ascii passthrough"],
  ];
  for (const [input, expected, label] of cases) {
    expect(KebabCase.from(input), label).toBe(expected);
  }
});

test("空 / 記号のみ", () => {
  const cases: Array<[string, string, string]> = [
    ["", "", "empty input"],
    ["!!!", "", "all symbols collapse to empty"],
  ];
  for (const [input, expected, label] of cases) {
    expect(KebabCase.from(input), label).toBe(expected);
  }
});
