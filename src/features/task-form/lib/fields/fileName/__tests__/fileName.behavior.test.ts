import { expect, test } from "vitest";
import { Result } from "@/utils/result";
import { FileNameField } from "..";

test("fromTitle はタイトルを kebab-case の base に変換する", () => {
  expect(FileNameField.fromTitle("Fix Login Bug")).toBe("fix-login-bug");
});

test("fromTitle は前後空白を除去してから変換する", () => {
  expect(FileNameField.fromTitle("  Fix Bug  ")).toBe("fix-bug");
});

test.each([
  ["my task"],
  ["fix.md-2"],
  ["  custom.MD  "],
])("fromInput(%j) は入力値を正規化せず生のまま保持する（入力中の値を破壊しない）", (input) => {
  expect(FileNameField.fromInput(input)).toBe(input);
});

test.each([
  ["my-task", "my-task.md"],
  ["my-task.md", "my-task.md"],
  ["my-task.MD", "my-task.md"],
  ["  my-task  ", "my-task.md"],
  ["  my-task.md  ", "my-task.md"],
  ["my task", "my task.md"],
])("toParam(%j) は trim + 末尾 .md 剥がし後に .md を付与した %j を返す", (input, expected) => {
  expect(FileNameField.toParam(FileNameField.fromInput(input))).toBe(expected);
});

test("toParam は末尾以外の .md を剥がさない", () => {
  expect(FileNameField.toParam(FileNameField.fromInput("my.md.task"))).toBe(
    "my.md.task.md",
  );
});

test.each([
  [""],
  ["   "],
  [".md"],
  [" .MD "],
])("toParam(%j) は正規化後 base が空のため undefined を返す（fileName キー省略）", (input) => {
  expect(FileNameField.toParam(FileNameField.fromInput(input))).toBe(undefined);
});

test("validate は空入力を許容する（追従中・BE 生成委譲のため）", () => {
  expect(FileNameField.validate(FileNameField.initial())).toEqual(
    Result.ok(undefined),
  );
});

test("validate はスペースを含む base を許容する（スペースは予約文字ではない）", () => {
  expect(FileNameField.validate(FileNameField.fromInput("my task"))).toEqual(
    Result.ok(undefined),
  );
});

test("validate は OS 予約文字を含む入力に FORBIDDEN_CHAR エラーを返す", () => {
  expect(FileNameField.validate(FileNameField.fromInput("a:b"))).toEqual(
    Result.err({ code: "FORBIDDEN_CHAR", chars: [":"] }),
  );
});

test("validate は複数の予約文字を定義順（FORBIDDEN_TITLE_CHARS 宣言順）に列挙する", () => {
  expect(FileNameField.validate(FileNameField.fromInput("a*b:c"))).toEqual(
    Result.err({ code: "FORBIDDEN_CHAR", chars: [":", "*"] }),
  );
});
