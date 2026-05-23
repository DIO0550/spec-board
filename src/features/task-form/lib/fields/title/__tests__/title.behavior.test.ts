import { expect, test } from "vitest";
import { Result } from "@/utils/result";
import {
  FORBIDDEN_TITLE_CHARS,
  TITLE_MAX_LENGTH,
  TitleField,
  type TitleValidationError,
} from "..";

const emptyCtx = { existingFileNames: new Set<string>() };

test("initial は空文字を返す", () => {
  expect(TitleField.initial()).toBe("");
});

test("normalize: 前後空白を trim する", () => {
  expect(TitleField.normalize("  x  ")).toBe("x");
});

test("validate: 空文字は EMPTY", () => {
  expect(TitleField.validate("", emptyCtx)).toEqual(
    Result.err({ code: "EMPTY" }),
  );
});

test("validate: 空白のみは EMPTY（trim 判定）", () => {
  expect(TitleField.validate("   ", emptyCtx)).toEqual(
    Result.err({ code: "EMPTY" }),
  );
});

test("validate: kebab 後空文字になる入力（記号/アンダースコアのみ）は EMPTY", () => {
  const cases: Array<[string, string]> = [
    ["!!!", "ASCII 記号のみ"],
    ["___", "アンダースコアのみ"],
    [".", "ドットのみ"],
    ["-_-", "ハイフン・アンダースコア混在"],
  ];
  for (const [input, label] of cases) {
    expect(TitleField.validate(input, emptyCtx), label).toEqual(
      Result.err({ code: "EMPTY" }),
    );
  }
});

test("validate: 非空文字で Ok", () => {
  expect(TitleField.validate("abc", emptyCtx)).toEqual(Result.ok(undefined));
});

test("validate: 禁止文字 1 個", () => {
  expect(TitleField.validate("a<b", emptyCtx)).toEqual(
    Result.err({ code: "FORBIDDEN_CHAR", chars: ["<"] }),
  );
});

test("validate: 禁止文字 複数（FORBIDDEN_TITLE_CHARS 宣言順）", () => {
  expect(TitleField.validate("a<b>c", emptyCtx)).toEqual(
    Result.err({ code: "FORBIDDEN_CHAR", chars: ["<", ">"] }),
  );
});

test("validate: 禁止文字 全種", () => {
  const all = FORBIDDEN_TITLE_CHARS.join("");
  const result = TitleField.validate(`x${all}`, emptyCtx);
  expect(result).toEqual(
    Result.err({
      code: "FORBIDDEN_CHAR",
      chars: [...FORBIDDEN_TITLE_CHARS],
    }),
  );
});

test("validate: TITLE_MAX_LENGTH ぴったりは Ok", () => {
  const v = "a".repeat(TITLE_MAX_LENGTH);
  expect(TitleField.validate(v, emptyCtx)).toEqual(Result.ok(undefined));
});

test("validate: TITLE_MAX_LENGTH 超過は TOO_LONG", () => {
  const v = "a".repeat(TITLE_MAX_LENGTH + 1);
  expect(TitleField.validate(v, emptyCtx)).toEqual(
    Result.err({
      code: "TOO_LONG",
      max: TITLE_MAX_LENGTH,
      actual: TITLE_MAX_LENGTH + 1,
    }),
  );
});

test("validate: DUPLICATE — kebab + .md が existingFileNames に含まれる", () => {
  const ctx = {
    existingFileNames: new Set<string>(["fix-login-bug.md"]),
  };
  expect(TitleField.validate("Fix Login Bug", ctx)).toEqual(
    Result.err({ code: "DUPLICATE", fileName: "fix-login-bug.md" }),
  );
});

test("validate: existingFileNames が空 Set のときは DUPLICATE 判定されない", () => {
  expect(TitleField.validate("Fix Login Bug", emptyCtx)).toEqual(
    Result.ok(undefined),
  );
});

test("validate: DUPLICATE — スコープ外（別 fileName）は Ok", () => {
  const ctx = {
    existingFileNames: new Set<string>(["other-task.md"]),
  };
  expect(TitleField.validate("Fix Login Bug", ctx)).toEqual(
    Result.ok(undefined),
  );
});

test("validate: 優先順位は EMPTY → FORBIDDEN_CHAR → TOO_LONG → DUPLICATE", () => {
  const longForbidden = `<${"a".repeat(TITLE_MAX_LENGTH + 1)}`;
  const ctx = {
    existingFileNames: new Set<string>([
      `${"a".repeat(TITLE_MAX_LENGTH + 1)}.md`,
    ]),
  };

  const cases: Array<[string, TitleValidationError, string]> = [
    ["", { code: "EMPTY" }, "empty wins over everything"],
    ["   ", { code: "EMPTY" }, "whitespace-only is EMPTY"],
    [
      longForbidden,
      { code: "FORBIDDEN_CHAR", chars: ["<"] },
      "FORBIDDEN_CHAR wins over TOO_LONG",
    ],
    [
      "a".repeat(TITLE_MAX_LENGTH + 1),
      {
        code: "TOO_LONG",
        max: TITLE_MAX_LENGTH,
        actual: TITLE_MAX_LENGTH + 1,
      },
      "TOO_LONG wins over DUPLICATE",
    ],
  ];

  for (const [input, expected, label] of cases) {
    expect(TitleField.validate(input, ctx), label).toEqual(
      Result.err(expected),
    );
  }
});
