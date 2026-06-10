import { expect, test } from "vitest";
import { Result } from "@/utils/result";
import { FileNameField } from "..";

test("initial は空文字（タイトル追従中の未確定状態）を返す", () => {
  expect(FileNameField.initial()).toBe("");
});

test("fromTitle はタイトルを kebab-case の base に変換する", () => {
  expect(FileNameField.fromTitle("Fix Login Bug")).toBe("fix-login-bug");
});

test("fromTitle は前後空白を除去してから変換する", () => {
  expect(FileNameField.fromTitle("  Fix Bug  ")).toBe("fix-bug");
});

test.each([
  ["my-task", "my-task"],
  ["my-task.md", "my-task"],
  ["my-task.MD", "my-task"],
  ["  my-task  ", "my-task"],
  ["  my-task.md  ", "my-task"],
])("normalizeInput(%j) は base %j に正規化する", (input, expected) => {
  expect(FileNameField.normalizeInput(input)).toBe(expected);
});

test("normalizeInput は末尾以外の .md を剥がさない", () => {
  expect(FileNameField.normalizeInput("my.md.task")).toBe("my.md.task");
});

test("toParam は base に .md を付与した完全名を返す", () => {
  const value = FileNameField.normalizeInput("my-task");
  expect(FileNameField.toParam(value)).toBe("my-task.md");
});

test("toParam は空 base に対して undefined を返す（fileName キー省略）", () => {
  expect(FileNameField.toParam(FileNameField.initial())).toBe(undefined);
});

test("validate は空 base を許容する（追従中・BE 生成委譲のため）", () => {
  expect(FileNameField.validate(FileNameField.initial())).toEqual(
    Result.ok(undefined),
  );
});

test("validate は通常の base を許容する", () => {
  const value = FileNameField.normalizeInput("my-task");
  expect(FileNameField.validate(value)).toEqual(Result.ok(undefined));
});

test("validate は OS 予約文字を含む base に FORBIDDEN_CHAR エラーを返す", () => {
  const value = FileNameField.normalizeInput("a:b");
  expect(FileNameField.validate(value)).toEqual(
    Result.err({ code: "FORBIDDEN_CHAR", chars: [":"] }),
  );
});

test("validate は複数の予約文字を定義順（FORBIDDEN_TITLE_CHARS 宣言順）に列挙する", () => {
  const value = FileNameField.normalizeInput("a*b:c");
  expect(FileNameField.validate(value)).toEqual(
    Result.err({ code: "FORBIDDEN_CHAR", chars: [":", "*"] }),
  );
});
